// Trade Activate load balancer, run free on Cloudflare Workers (100,000 requests a day on the free plan).
//
// The app calls ONE address (this worker). The worker passes each request to server 1, 2 or 3,
// skips any server that failed recently, and retries on the next one if a server is down or asleep.
//
// Set the servers in wrangler.toml:  API_SERVERS = "https://ta-api-1.onrender.com,https://ta-api-2.onrender.com,https://ta-api-3.onrender.com"

const COOLDOWN_MS = 30_000;
const down = new Map(); // server -> time it last failed (per worker instance)
let next = 0;

export function pickOrder(servers, now = Date.now()) {
  const start = next++ % servers.length;
  const ring = servers.map((_, i) => servers[(start + i) % servers.length]);
  const up = ring.filter(s => !(down.get(s) > now - COOLDOWN_MS));
  return up.length ? [...up, ...ring.filter(s => !up.includes(s))] : ring;
}

const cors = origin => ({
  "access-control-allow-origin": origin || "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-expose-headers": "x-served-by",
  "access-control-max-age": "86400",
  vary: "origin"
});

export default {
  async fetch(request, env) {
    const servers = String(env.API_SERVERS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request.headers.get("origin")) });
    if (!servers.length) return Response.json({ error: "API_SERVERS is not set" }, { status: 500 });

    // /lb/status: check every server at once (the app's System status card uses this).
    if (url.pathname === "/lb/status") {
      const results = await Promise.all(servers.map(async (s, i) => {
        const t = Date.now();
        try { const r = await fetch(s + "/health", { signal: AbortSignal.timeout(20_000) }); const b = await r.json().catch(() => ({})); return { name: `server-${i + 1}`, url: s, ok: r.ok, ms: Date.now() - t, ...b }; }
        catch (e) { return { name: `server-${i + 1}`, url: s, ok: false, ms: Date.now() - t, error: String(e.message || e) }; }
      }));
      return Response.json({ loadBalancer: "cloudflare-worker", servers: results }, { headers: { ...cors(request.headers.get("origin")), "cache-control": "no-store" } });
    }

    // Bodies can only be read once, so keep a copy for retries.
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
    let last;
    for (const s of pickOrder(servers)) {
      try {
        const r = await fetch(s + url.pathname + url.search, { method: request.method, headers: request.headers, body, redirect: "manual" });
        if (r.status >= 502 && r.status <= 504) { down.set(s, Date.now()); last = r; continue; }
        const h = new Headers(r.headers);
        for (const [k, v] of Object.entries(cors(request.headers.get("origin")))) h.set(k, v);
        return new Response(r.body, { status: r.status, headers: h });
      } catch (e) { down.set(s, Date.now()); last = e; }
    }
    return Response.json({ error: "All API servers are unavailable. The app keeps working offline and will sync later." }, { status: 503, headers: cors(request.headers.get("origin")) });
  }
};
