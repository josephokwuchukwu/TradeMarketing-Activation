import http from "node:http";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { initCache, cache } from "./cache.js";
import { handle } from "./app.js";

await initCache();
try { if (await migrate()) console.log("[db] schema ready"); else console.warn("[db] DATABASE_URL not set: API will answer 503 until it is"); }
catch (e) { console.error("[db] migration failed:", e.message); }

const server = http.createServer(handle);
server.keepAliveTimeout = 65_000; // longer than most load balancers' idle timeout
server.listen(config.port, () => console.log(`[${config.serverId}] Trade Activate API listening on :${config.port}`));

// Finish in-flight requests when the host restarts us, so the load balancer can move traffic over cleanly.
const stop = sig => {
  console.log(`[${config.serverId}] ${sig}: shutting down`);
  server.close(async () => { await pool?.end().catch(() => { }); await cache.close(); process.exit(0); });
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
