// Redis does four jobs here, all of which must be shared when there are several servers:
//   1. sessions   – a phone signed in through server 1 is still signed in when the load balancer sends it to server 3
//   2. rate limits – stops someone guessing PINs by spreading attempts across servers
//   3. cache       – the full data download is built once and reused until something changes
//   4. pub/sub     – when a BA saves on server 2, dashboards connected to servers 1 and 3 refresh live
// Without REDIS_URL it uses Postgres for sessions and rate limits (needed on Vercel, where every request can
// land on a fresh copy of the server), or this server's memory when there is no database either.
import { EventEmitter } from "node:events";
import { config } from "./config.js";
import { q } from "./db.js";

const CHANNEL = "ta:changes";
const bus = new EventEmitter(); bus.setMaxListeners(0);

function memoryStore() {
  const kv = new Map(); // key -> { v, exp }
  const alive = k => { const e = kv.get(k); if (!e) return null; if (e.exp && e.exp < Date.now()) { kv.delete(k); return null; } return e; };
  return {
    kind: "memory",
    async get(k) { return alive(k)?.v ?? null; },
    async set(k, v, ttlSec) { kv.set(k, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 }); },
    async del(k) { kv.delete(k); },
    async incr(k, ttlSec) { const e = alive(k); const v = (e ? +e.v : 0) + 1; kv.set(k, { v, exp: e?.exp || (ttlSec ? Date.now() + ttlSec * 1000 : 0) }); return v; },
    async publish(msg) { bus.emit("msg", msg); },
    async health() { return { ok: true, kind: "memory", note: "REDIS_URL not set: sessions live on this server only" }; },
    async close() { }
  };
}

async function redisStore(url) {
  const { Redis } = await import("ioredis");
  const opts = { maxRetriesPerRequest: 2, enableReadyCheck: true, lazyConnect: false };
  if (url.startsWith("rediss://")) opts.tls = {};
  const r = new Redis(url, opts), sub = new Redis(url, opts);
  r.on("error", e => console.error("[redis]", e.message)); sub.on("error", e => console.error("[redis sub]", e.message));
  await sub.subscribe(CHANNEL);
  sub.on("message", (_ch, m) => { try { bus.emit("msg", JSON.parse(m)); } catch { } });
  return {
    kind: "redis",
    async get(k) { return r.get(k); },
    async set(k, v, ttlSec) { return ttlSec ? r.set(k, v, "EX", ttlSec) : r.set(k, v); },
    async del(k) { return r.del(k); },
    async incr(k, ttlSec) { const v = await r.incr(k); if (v === 1 && ttlSec) await r.expire(k, ttlSec); return v; },
    async publish(msg) { await r.publish(CHANNEL, JSON.stringify(msg)); },
    async health() { const t = Date.now(); try { await r.ping(); return { ok: true, kind: "redis", ms: Date.now() - t }; } catch (e) { return { ok: false, kind: "redis", error: e.message }; } },
    async close() { r.disconnect(); sub.disconnect(); }
  };
}

// Sessions and rate limits in a small Postgres table. No live push between servers (the app polls instead)
// and no snapshot cache (a fresh download is built each time, which is fine for one agency's data).
function pgStore() {
  const live = "(exp is null or exp > now())";
  const ttl = s => s ? new Date(Date.now() + s * 1000) : null;
  return {
    kind: "postgres",
    async get(k) { if (k.startsWith("snap:")) return null; const { rows } = await q(`select v from kv where k = $1 and ${live}`, [k]); return rows[0]?.v ?? null; },
    async set(k, v, ttlSec) { if (k.startsWith("snap:")) return; await q("insert into kv (k, v, exp) values ($1, $2, $3) on conflict (k) do update set v = excluded.v, exp = excluded.exp", [k, String(v), ttl(ttlSec)]); },
    async del(k) { await q("delete from kv where k = $1", [k]); },
    async incr(k, ttlSec) {
      const { rows } = await q(
        `insert into kv (k, v, exp) values ($1, '1', $2)
         on conflict (k) do update set v = case when kv.exp is not null and kv.exp <= now() then '1' else (kv.v::bigint + 1)::text end,
           exp = case when kv.exp is not null and kv.exp <= now() then excluded.exp else kv.exp end
         returning v`, [k, ttl(ttlSec)]);
      if (Math.random() < 0.02) q(`delete from kv where exp is not null and exp < now()`).catch(() => { });
      return +rows[0].v;
    },
    async publish(msg) { bus.emit("msg", msg); },
    async health() { return { ok: true, kind: "postgres", note: "No Redis: sessions are kept in the database" }; },
    async close() { }
  };
}

export let cache = memoryStore();
export async function initCache() {
  if (!config.redisUrl && config.databaseUrl) { cache = pgStore(); console.log("[cache] REDIS_URL not set: sessions in Postgres"); return cache; }
  if (!config.redisUrl) { console.log("[cache] REDIS_URL not set: using in-memory cache"); return cache; }
  try { cache = await redisStore(config.redisUrl); console.log("[cache] connected to Redis"); }
  catch (e) { console.error("[cache] Redis unavailable, using memory:", e.message); }
  return cache;
}
export const onChange = fn => { bus.on("msg", fn); return () => bus.off("msg", fn); };
