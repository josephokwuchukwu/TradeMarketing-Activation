// End-to-end API tests. Needs a Postgres in DATABASE_URL (and optionally Redis in REDIS_URL).
// Runs three copies of the server, like production, and checks that they share sessions and changes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import pg from "pg";

const DB = process.env.DATABASE_URL;
const sha = pw => createHash("sha256").update("ta:" + pw).digest("hex");
const PORTS = [18081, 18082, 18083];
const procs = [];
const base = i => `http://127.0.0.1:${PORTS[i]}`;
const call = async (i, path, { method = "GET", token, body } = {}) => {
  const r = await fetch(base(i) + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, server: r.headers.get("x-served-by"), body: await r.json().catch(() => null) };
};

before(async () => {
  if (!DB) return;
  process.env.OWNER_PW_HASH = sha("Test@123"); // a test owner password instead of the real one
  const c = new pg.Client({ connectionString: DB }); await c.connect();
  await c.query("drop table if exists records, photos; drop sequence if exists records_seq;"); await c.end();
  for (const [i, port] of PORTS.entries()) {
    const p = spawn(process.execPath, ["src/index.js"], { env: { ...process.env, PORT: String(port), SERVER_ID: `server-${i + 1}`, DATABASE_SSL: "off" }, stdio: ["ignore", "pipe", "pipe"] });
    p.stderr.on("data", d => process.stderr.write(`[s${i + 1}] ${d}`));
    procs.push(p);
    // start one at a time so the first one creates the schema
    for (let t = 0; t < 50; t++) { try { if ((await fetch(base(i) + "/health")).ok) break; } catch { } await new Promise(r => setTimeout(r, 200)); }
  }
});
after(() => procs.forEach(p => p.kill("SIGTERM")));

test("all three servers are healthy", { skip: !DB }, async () => {
  for (const i of [0, 1, 2]) {
    const h = await call(i, "/health");
    assert.equal(h.status, 200);
    assert.equal(h.body.server, `server-${i + 1}`);
    assert.equal(h.body.db.ok, true);
  }
});

let admin, mgr, ba;
test("owner admin exists on an empty database and can sign in", { skip: !DB }, async () => {
  const bad = await call(0, "/api/login", { method: "POST", body: { login: "jay@tradeactivate.app", hash: sha("wrong") } });
  assert.equal(bad.status, 401);
  const r = await call(0, "/api/login", { method: "POST", body: { login: "jay@tradeactivate.app", hash: sha("Test@123") } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.token);
  assert.equal(r.body.user.pw, undefined);
  admin = r.body.token;
});

test("a session made on server 1 works on servers 2 and 3", { skip: !DB || !process.env.REDIS_URL }, async () => {
  for (const i of [1, 2]) assert.equal((await call(i, "/api/me", { token: admin })).status, 200);
});

test("admin uploads data; managers and ambassadors see only their agency", { skip: !DB }, async () => {
  const changes = [
    { coll: "vendors", id: "v_a", data: { id: "v_a", name: "Agency A" } },
    { coll: "vendors", id: "v_b", data: { id: "v_b", name: "Agency B" } },
    { coll: "users", id: "u_ma", data: { id: "u_ma", role: "manager", name: "Mgr A", login: "mgr@a.ng", vendorId: "v_a", pw: sha("Manager@123") } },
    { coll: "users", id: "u_ba1", data: { id: "u_ba1", role: "ba", name: "BA One", login: "BA-1", phone: "08031234567", vendorId: "v_a", pw: sha("1234") } },
    { coll: "outlets", id: "o1", data: { id: "o1", name: "Outlet A", vendorId: "v_a" } },
    { coll: "outlets", id: "o2", data: { id: "o2", name: "Outlet B", vendorId: "v_b" } }
  ];
  const r = await call(0, "/api/sync", { method: "POST", token: admin, body: { changes } });
  assert.equal(r.status, 200); assert.equal(r.body.applied, 6); assert.deepEqual(r.body.rejected, []);

  mgr = (await call(1, "/api/login", { method: "POST", body: { login: "MGR@a.ng", hash: sha("Manager@123") } })).body.token;
  ba = (await call(2, "/api/login", { method: "POST", body: { login: "0803 123 4567", hash: sha("1234") } })).body.token;
  assert.ok(mgr && ba);

  const seen = await call(1, "/api/sync?since=0", { token: mgr });
  const ids = seen.body.records.map(x => x.id).sort();
  assert.deepEqual(ids, ["o1", "u_ba1", "u_ma", "v_a"]);
  assert.ok(seen.body.records.every(x => !x.data.pw), "no password hashes leave the server");
});

test("a bulk upload doesn't reset passwords already on the server", { skip: !DB }, async () => {
  await call(0, "/api/sync", { method: "POST", token: admin, body: { changes: [{ coll: "users", id: "u_ma", keepSecret: true, data: { id: "u_ma", role: "manager", name: "Mgr A", login: "mgr@a.ng", vendorId: "v_a", pw: sha("Other@1") } }] } });
  assert.equal((await call(0, "/api/login", { method: "POST", body: { login: "mgr@a.ng", hash: sha("Manager@123") } })).status, 200);
  assert.equal((await call(0, "/api/login", { method: "POST", body: { login: "mgr@a.ng", hash: sha("Other@1") } })).status, 401);
});

test("ambassadors can log their own entry but not someone else's or another agency's", { skip: !DB }, async () => {
  const mine = { id: "e1", baId: "u_ba1", vendorId: "v_a", outletId: "o1", brand: "Eagle", type: "Activation", start: Date.now() };
  const r = await call(2, "/api/sync", { method: "POST", token: ba, body: { changes: [
    { coll: "entries", id: "e1", data: mine },
    { coll: "entries", id: "e2", data: { ...mine, id: "e2", baId: "u_other" } },
    { coll: "entries", id: "e3", data: { ...mine, id: "e3", vendorId: "v_b" } },
    { coll: "outlets", id: "o1", data: { id: "o1", name: "Hacked", vendorId: "v_a" } }
  ] } });
  assert.equal(r.body.applied, 1);
  assert.equal(r.body.rejected.length, 3);
});

test("incremental sync returns only what changed, including deletes", { skip: !DB }, async () => {
  const first = await call(0, "/api/sync?since=0", { token: admin });
  const seq = first.body.seq;
  await call(1, "/api/sync", { method: "POST", token: mgr, body: { changes: [{ coll: "outlets", id: "o1", deleted: true }] } });
  const next = await call(2, "/api/sync?since=" + seq, { token: admin });
  assert.deepEqual(next.body.records.map(x => [x.id, x.deleted]), [["o1", true]]);
});

test("photos upload once and download on any server", { skip: !DB }, async () => {
  const dataUrl = "data:image/jpeg;base64," + Buffer.from("fake-jpeg-bytes").toString("base64");
  const up = await call(0, "/api/photos/ph_test1", { method: "PUT", token: ba, body: { dataUrl, entryId: "e1", meta: { time: 1 } } });
  assert.equal(up.status, 200);
  const down = await call(2, "/api/photos/ph_test1", { token: mgr });
  assert.equal(down.status, 200); assert.equal(down.body.dataUrl, dataUrl); assert.equal(down.body.time, 1);
});

test("a change on one server reaches live streams on another", { skip: !DB || !process.env.REDIS_URL }, async () => {
  const ctl = new AbortController();
  const r = await fetch(base(2) + "/api/events?token=" + admin, { signal: ctl.signal });
  const reader = r.body.getReader(); let got = "";
  const wait = (async () => { while (!got.includes("event: change")) { const { value, done } = await reader.read(); if (done) break; got += new TextDecoder().decode(value); } })();
  await new Promise(r => setTimeout(r, 150));
  await call(0, "/api/sync", { method: "POST", token: admin, body: { changes: [{ coll: "folders", id: "f1", data: { id: "f1", vendorId: "v_a", name: "Promo" } }] } });
  await Promise.race([wait, new Promise((_, j) => setTimeout(() => j(new Error("no live event")), 3000))]);
  ctl.abort();
  assert.match(got, /server-1/);
});

test("load balancer spreads requests over all three servers and skips a dead one", { skip: !DB }, async () => {
  const { default: lb } = await import("../../infra/load-balancer/worker.js");
  const env = { API_SERVERS: [...PORTS.map((_, i) => base(i)), "http://127.0.0.1:1"].join(",") };
  const seen = new Set();
  for (let k = 0; k < 8; k++) {
    const r = await lb.fetch(new Request("https://lb.example/health"), env);
    assert.equal(r.status, 200);
    seen.add((await r.json()).server);
  }
  assert.deepEqual([...seen].sort(), ["server-1", "server-2", "server-3"]);
  const st = await (await lb.fetch(new Request("https://lb.example/lb/status"), env)).json();
  assert.deepEqual(st.servers.map(s => s.ok), [true, true, true, false]);
});
