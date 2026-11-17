#!/usr/bin/env node
// Runs the Cloudflare load balancer (infra/load-balancer/worker.js) on your own computer, for testing without Docker.
//   API_SERVERS=http://localhost:8081,http://localhost:8082,http://localhost:8083 node scripts/local-lb.mjs
// Then use http://localhost:8787 as the API address in the app.
import http from "node:http";
import { Readable } from "node:stream";
import lb from "../infra/load-balancer/worker.js";

const env = { API_SERVERS: process.env.API_SERVERS || "http://localhost:8081,http://localhost:8082,http://localhost:8083" };
const port = +(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  try {
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : Readable.toWeb(req);
    const r = await lb.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body, duplex: "half" }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (!r.body) return res.end();
    const out = Readable.fromWeb(r.body);
    out.on("error", () => res.destroy()); // a server went away mid-stream (e.g. live updates): drop this connection, the app reconnects
    out.pipe(res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}).listen(port, () => console.log(`Load balancer on http://localhost:${port} → ${env.API_SERVERS}`));
