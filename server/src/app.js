// HTTP API, built on Node's own http module (no framework to keep patched).
//   GET  /health                 – is this server, its database and Redis OK? (load balancer and status page use it)
//   POST /api/login              – { login, hash } → { token, user }
//   POST /api/logout
//   GET  /api/me
//   GET  /api/sync?since=<seq>   – records changed since the last sync, limited to what this user may see
//   POST /api/sync               – { changes: [{ coll, id, data, deleted }] }
//   PUT  /api/photos/:id         – { dataUrl, entryId, vendorId, meta }
//   GET  /api/photos/:id
//   GET  /api/events?token=…     – live "something changed" stream (Server-Sent Events)
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { q, pool, COLLS, dbHealth, hashSecret, checkSecret } from "./db.js";
import { cache, onChange } from "./cache.js";
import { canRead, canWrite, publicData, vendorOfRecord } from "./rules.js";

const started = Date.now();
const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-served-by": config.serverId, ...extra });
  res.end(JSON.stringify(body));
};
const fail = (status, message) => Object.assign(new Error(message), { status });

function cors(req, res) {
  const origin = req.headers.origin;
  const allow = config.corsOrigins.includes("*") ? "*" : (origin && config.corsOrigins.includes(origin) ? origin : "");
  if (allow) res.setHeader("access-control-allow-origin", allow);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("access-control-expose-headers", "x-served-by");
  res.setHeader("access-control-max-age", "86400");
}

async function body(req) {
  const max = config.maxBodyMb * 1024 * 1024; let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw fail(413, "Upload too large"); chunks.push(c); }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw fail(400, "Body is not valid JSON"); }
}
const ip = req => (req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();

/* ---------- sessions (in Redis so every server sees them) ---------- */
async function userFromToken(token) {
  if (!token) return null;
  const id = await cache.get("sess:" + token);
  if (!id) return null;
  const { rows } = await q("select data from records where coll = 'users' and id = $1 and not deleted", [id]);
  const u = rows[0]?.data;
  return u && !u.disabled ? u : null;
}
async function auth(req, url) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : url.searchParams.get("token");
  const u = await userFromToken(token);
  if (!u) throw fail(401, "Sign in again");
  return { user: u, token };
}

/* ---------- handlers ---------- */
async function health() {
  const [db, redis] = await Promise.all([dbHealth(), cache.health()]);
  return { ok: db.ok && redis.ok, server: config.serverId, version: config.version, uptimeSec: Math.round((Date.now() - started) / 1000), db, redis, time: new Date().toISOString() };
}

async function login(req) {
  const { login, hash } = await body(req);
  if (!login || !hash) throw fail(400, "Enter your sign-in and password");
  const key = "rl:login:" + ip(req);
  if (await cache.incr(key, 900) > 30) throw fail(429, "Too many tries. Wait 15 minutes and try again.");
  const id = String(login).trim().toLowerCase(), digits = id.replace(/\D/g, "");
  const { rows } = await q(
    `select id, data, secret from records where coll = 'users' and not deleted and (
       lower(data->>'login') = $1
       or (data->>'role' = 'ba' and lower(coalesce(data->>'email','')) = $1)
       or (data->>'role' = 'ba' and length($2) >= 10 and regexp_replace(coalesce(data->>'phone',''), '\\D', '', 'g') = $2))
     limit 5`, [id, digits]);
  const row = rows.find(r => checkSecret(hash, r.secret));
  if (!row) throw fail(401, "That sign-in didn't match an account. Check the details and try again.");
  if (row.data.disabled) throw fail(403, "This account has been switched off. Ask your vendor manager to turn it back on.");
  const token = randomBytes(32).toString("base64url");
  await cache.set("sess:" + token, row.id, config.sessionDays * 86400);
  await cache.del(key);
  return { token, user: publicData("users", row.data) };
}

// The full download is cached per agency in Redis and rebuilt only when the data version moves on.
async function pull(user, since) {
  const ver = (await cache.get("ver")) || "0";
  const scope = user.role === "admin" ? "all" : "v:" + user.vendorId;
  const ck = `snap:${scope}:${ver}`;
  if (!since) { const hit = await cache.get(ck); if (hit) return { ...JSON.parse(hit), cached: true }; }
  const params = [since || 0];
  let where = "seq > $1";
  if (user.role !== "admin") { params.push(user.vendorId || "-"); where += " and vendor_id = $2"; }
  const { rows } = await q(`select coll, id, data, deleted, seq, vendor_id from records where ${where} order by seq limit 20000`, params);
  const { rows: mx } = await q("select coalesce(max(seq), 0)::text as seq from records");
  const out = {
    seq: rows.length === 20000 ? String(rows[rows.length - 1].seq) : mx[0].seq,
    more: rows.length === 20000,
    records: rows.filter(r => canRead(user, r.coll, r)).filter(r => !since ? !r.deleted : true)
      .map(r => ({ coll: r.coll, id: r.id, deleted: r.deleted, data: r.deleted ? null : publicData(r.coll, r.data) }))
  };
  if (!since && !out.more) await cache.set(ck, JSON.stringify(out), 300);
  return out;
}

async function push(user, req) {
  const { changes } = await body(req);
  if (!Array.isArray(changes)) throw fail(400, "Expected { changes: [...] }");
  if (changes.length > 5000) throw fail(413, "Send at most 5000 changes at a time");
  const applied = [], rejected = [];
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const ch of changes) {
      const { coll, id } = ch || {};
      if (!COLLS.includes(coll) || !id || typeof id !== "string" || id.length > 80) { rejected.push({ coll, id, reason: "Bad record" }); continue; }
      const { rows } = await client.query("select data, secret, deleted from records where coll = $1 and id = $2 for update", [coll, id]);
      const before = rows[0] && !rows[0].deleted ? rows[0].data : null;
      const del = !!ch.deleted || ch.data == null;
      if (del && !before) { applied.push({ coll, id }); continue; }
      let after = del ? null : { ...ch.data, id };
      const why = canWrite(user, coll, before, after);
      if (why) { rejected.push({ coll, id, reason: why }); continue; }
      let secret = rows[0]?.secret || null;
      if (after && coll === "users") {
        // keepSecret: a bulk upload from a device must not reset passwords people already use on the server
        if (after.pw && !(ch.keepSecret && secret)) secret = hashSecret(String(after.pw));
        delete after.pw;
        if (after.login) after.login = String(after.login).trim();
        if (before?.owner) after.owner = true;
      }
      if (del) {
        await client.query("update records set deleted = true, seq = nextval('records_seq'), updated_at = now(), updated_by = $3 where coll = $1 and id = $2", [coll, id, user.id]);
      } else {
        await client.query(
          `insert into records (coll, id, vendor_id, data, secret, deleted, updated_by) values ($1, $2, $3, $4, $5, false, $6)
           on conflict (coll, id) do update set vendor_id = excluded.vendor_id, data = excluded.data, secret = excluded.secret, deleted = false,
             seq = nextval('records_seq'), updated_at = now(), updated_by = excluded.updated_by`,
          [coll, id, vendorOfRecord(coll, after), after, secret, user.id]);
      }
      applied.push({ coll, id, vendorId: vendorOfRecord(coll, after || before) });
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback").catch(() => { }); throw e; }
  finally { client.release(); }
  const { rows: mx } = await q("select coalesce(max(seq), 0)::text as seq from records");
  if (applied.length) {
    await cache.incr("ver");
    await cache.publish({ seq: mx[0].seq, by: user.id, vendors: [...new Set(applied.map(a => a.vendorId || null))], server: config.serverId });
  }
  return { seq: mx[0].seq, applied: applied.length, rejected };
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
async function putPhoto(user, id, req) {
  if (!/^[\w-]{3,80}$/.test(id)) throw fail(400, "Bad photo id");
  const b = await body(req);
  const m = DATA_URL.exec(b.dataUrl || "");
  if (!m) throw fail(400, "Expected a JPEG, PNG or WebP data URL");
  const vendorId = user.role === "admin" ? (b.vendorId || null) : user.vendorId;
  const { rows } = await q("select vendor_id, owner_id from photos where id = $1", [id]);
  if (rows[0]) {
    if (user.role !== "admin" && rows[0].vendor_id !== user.vendorId) throw fail(403, "Outside your agency");
    if (user.role === "ba" && rows[0].owner_id !== user.id) throw fail(403, "Not your photo");
  }
  const meta = { ...(b.meta || {}), entryId: b.entryId || null };
  await q(`insert into photos (id, vendor_id, owner_id, mime, bytes, meta) values ($1, $2, $3, $4, $5, $6)
           on conflict (id) do update set mime = excluded.mime, bytes = excluded.bytes, meta = excluded.meta`,
    [id, vendorId, user.id, m[1], Buffer.from(m[2], "base64"), meta]);
  return { id, bytes: Math.round(m[2].length * .75) };
}
async function getPhoto(user, id) {
  const { rows } = await q("select vendor_id, mime, bytes, meta from photos where id = $1", [id]);
  const p = rows[0];
  if (!p) throw fail(404, "No such photo");
  if (user.role !== "admin" && p.vendor_id !== user.vendorId) throw fail(403, "Outside your agency");
  return { id, ...p.meta, dataUrl: `data:${p.mime};base64,${p.bytes.toString("base64")}` };
}

// Live updates: each server streams to the phones connected to it; Redis pub/sub tells every server when anything changes.
const streams = new Set();
onChange(msg => {
  for (const s of streams) {
    if (s.user.role === "admin" || (msg.vendors || []).includes(s.user.vendorId)) s.res.write(`event: change\ndata: ${JSON.stringify({ seq: msg.seq, server: msg.server })}\n\n`);
  }
});
function events(user, req, res) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", "x-served-by": config.serverId });
  res.write(`event: hello\ndata: ${JSON.stringify({ server: config.serverId })}\n\n`);
  const s = { user, res }; streams.add(s);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => { clearInterval(ping); streams.delete(s); });
}

export async function handle(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (p === "/" ) return json(res, 200, { name: "Trade Activate API", server: config.serverId, health: "/health" });
    if (p === "/health" || p === "/api/health") { const h = await health(); return json(res, h.ok ? 200 : 503, h); }
    if (p === "/api/login" && req.method === "POST") return json(res, 200, await login(req));
    const { user, token } = await auth(req, url);
    if (p === "/api/logout" && req.method === "POST") { await cache.del("sess:" + token); return json(res, 200, { ok: true }); }
    if (p === "/api/me") return json(res, 200, { user: publicData("users", user), server: config.serverId });
    if (p === "/api/sync" && req.method === "GET") return json(res, 200, await pull(user, +(url.searchParams.get("since") || 0)));
    if (p === "/api/sync" && req.method === "POST") return json(res, 200, await push(user, req));
    if (p === "/api/events") return events(user, req, res);
    const ph = /^\/api\/photos\/([^/]+)$/.exec(p);
    if (ph && req.method === "PUT") return json(res, 200, await putPhoto(user, decodeURIComponent(ph[1]), req));
    if (ph && req.method === "GET") return json(res, 200, await getPhoto(user, decodeURIComponent(ph[1])), { "cache-control": "private, max-age=86400" });
    throw fail(404, "Not found");
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(`[${config.serverId}]`, req.method, p, e);
    if (!res.headersSent) json(res, status, { error: status >= 500 ? "Server error. Try again shortly." : e.message });
  }
}
