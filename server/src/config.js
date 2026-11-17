// Settings come from environment variables so the same code runs as server 1, 2 and 3.
const env = process.env;

export const config = {
  port: +(env.PORT || 8080),
  // Which copy of the API this is. Shown on /health so you can see the load balancer spreading traffic.
  serverId: env.SERVER_ID || env.RENDER_SERVICE_NAME || env.FLY_MACHINE_ID || "server-local",
  // Postgres connection. Point this at the pooler (PgBouncer locally, Supabase's pooler on port 6543 in production).
  databaseUrl: env.DATABASE_URL || "",
  // How many database connections this one server may hold. Keep it small: the pooler shares them out.
  dbPoolMax: +(env.DB_POOL_MAX || 5),
  // Supabase and most hosted Postgres need TLS. Set DATABASE_SSL=off for a local database.
  dbSsl: (env.DATABASE_SSL || (/localhost|127\.0\.0\.1|@postgres|@pgbouncer/.test(env.DATABASE_URL || "") ? "off" : "on")) !== "off",
  // Redis (Upstash in production). Without it each server keeps sessions in its own memory, which only works with one server.
  redisUrl: env.REDIS_URL || "",
  // Browsers allowed to call the API, comma separated. "*" allows any.
  corsOrigins: (env.CORS_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean),
  // The first admin, created on an empty database so someone can sign in and upload the rest.
  ownerLogin: (env.OWNER_LOGIN || "jay@tradeactivate.app").toLowerCase(),
  ownerName: env.OWNER_NAME || "Jay",
  // SHA-256 of "ta:" + password, the same hash the app makes. The default is the owner hash already in the app.
  ownerPwHash: env.OWNER_PW_HASH || "d58a4b20dad9e715679d0c0fc83fe093295fc86afcb8e06e2eeee409aa489cad",
  sessionDays: +(env.SESSION_DAYS || 30),
  maxBodyMb: +(env.MAX_BODY_MB || 8),
  version: "1.0.0"
};
