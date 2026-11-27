// Postgres access. Every server keeps a small pool and goes through the connection pooler,
// so three servers (or thirty) never run the free database out of connections.
import pg from "pg";
import { config } from "./config.js";

// Stored on the server is a scrypt of the app's SHA-256 hash, so a copy of the database can't be used to sign in.
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
export const hashSecret = h => { const salt = randomBytes(16).toString("hex"); return `s1$${salt}$${scryptSync(h, salt, 32).toString("hex")}`; };
export const checkSecret = (h, stored) => {
  if (!stored || !h) return false;
  if (!stored.startsWith("s1$")) return stored === h;
  const [, salt, key] = stored.split("$");
  const a = scryptSync(h, salt, 32), b = Buffer.from(key, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

export const COLLS = ["vendors", "users", "outlets", "entries", "folders"];

export const pool = config.databaseUrl ? new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false
}) : null;
if (pool) pool.on("error", e => console.error("[db] idle client error:", e.message));

export const q = (text, params) => {
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set"), { status: 503 });
  return pool.query(text, params);
};

// Runs on every start; each statement is safe to repeat.
const SCHEMA = `
create sequence if not exists records_seq;
create table if not exists records (
  coll        text not null,
  id          text not null,
  vendor_id   text,
  data        jsonb not null,
  secret      text,
  deleted     boolean not null default false,
  seq         bigint not null default nextval('records_seq'),
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (coll, id)
);
create index if not exists records_seq_idx on records (seq);
create index if not exists records_vendor_idx on records (coll, vendor_id);
create index if not exists records_login_idx on records ((lower(data->>'login'))) where coll = 'users';
create table if not exists photos (
  id          text primary key,
  vendor_id   text,
  owner_id    text,
  mime        text not null default 'image/jpeg',
  bytes       bytea not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists photos_vendor_idx on photos (vendor_id);
-- Supabase exposes tables through its public REST API; with row level security on and no policies,
-- only this server (which connects as the database owner) can read them.
alter table records enable row level security;
alter table photos enable row level security;
-- Sessions and sign-in limits when there is no Redis (Vercel).
create table if not exists kv (k text primary key, v text not null, exp timestamptz);
alter table kv enable row level security;
`;

export async function migrate() {
  if (!pool) return false;
  await q(SCHEMA);
  // First start on an empty database: create the owner admin so the app can sign in and upload data.
  const { rows } = await q("select count(*)::int as n from records where coll = 'users' and not deleted");
  if (rows[0].n === 0) {
    const owner = { id: "u_jay", role: "admin", name: config.ownerName, login: config.ownerLogin, owner: true };
    await q("insert into records (coll, id, vendor_id, data, secret, updated_by) values ('users', $1, null, $2, $3, 'system') on conflict do nothing",
      [owner.id, owner, hashSecret(config.ownerPwHash)]);
    console.log(`[db] empty database: created owner admin ${config.ownerLogin}`);
  }
  return true;
}

export async function dbHealth() {
  if (!pool) return { ok: false, error: "DATABASE_URL is not set" };
  const t = Date.now();
  try { await q("select 1"); return { ok: true, ms: Date.now() - t, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } }; }
  catch (e) { return { ok: false, error: e.message }; }
}
