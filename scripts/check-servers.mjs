#!/usr/bin/env node
// Checks the Trade Activate servers and prints a plain report.
//   node scripts/check-servers.mjs https://trade-activate-lb.YOU.workers.dev
//   node scripts/check-servers.mjs https://ta-api-1.onrender.com https://ta-api-2.onrender.com https://ta-api-3.onrender.com
// Exits with code 1 if anything is down, so GitHub Actions can flag it.
const urls = (process.argv.slice(2).length ? process.argv.slice(2) : [process.env.API_SERVERS || ""]).flatMap(a => a.split(",")).map(s => s.trim()).filter(Boolean);
if (!urls.length) { console.log("No servers given. Pass URLs or set API_SERVERS."); process.exit(0); }
const get = async u => { const t = Date.now(); try { const r = await fetch(u, { signal: AbortSignal.timeout(75_000) }); return { status: r.status, ms: Date.now() - t, body: await r.json().catch(() => ({})) }; } catch (e) { return { status: 0, ms: Date.now() - t, body: {}, error: e.message }; } };
let bad = 0;
const line = (name, ok, extra) => { if (!ok) bad++; console.log(`${ok ? "✅" : "❌"} ${name.padEnd(12)} ${extra}`); };
for (const u0 of urls) {
  const u = u0.replace(/\/+$/, "");
  const lb = await get(u + "/lb/status");
  if (lb.status === 200 && lb.body.servers) {
    console.log(`Load balancer ${u}`);
    for (const s of lb.body.servers) line(s.name, s.ok, s.ok ? `${s.ms} ms · database ${s.db?.ok ? "ok" : "DOWN"} · redis ${s.redis?.ok ? s.redis.kind : "DOWN"} · up ${s.uptimeSec}s` : (s.error || `HTTP ${s.status}`));
    continue;
  }
  const h = await get(u + "/health");
  line(h.body.server || u, h.status === 200, h.status === 200 ? `${h.ms} ms · database ${h.body.db?.ok ? `ok (pool ${h.body.db.pool?.total ?? "?"} open)` : "DOWN"} · redis ${h.body.redis?.ok ? h.body.redis.kind : "DOWN"}` : (h.error || `HTTP ${h.status} ${JSON.stringify(h.body).slice(0, 160)}`));
}
process.exit(bad ? 1 : 0);
