// Vercel entry point: every /api/* and /health request is sent here (see vercel.json) and handled by the
// same API code that runs on Render or Docker (server/src). Settings come from Vercel's Environment Variables:
//   DATABASE_URL  Supabase "Transaction pooler" connection string (port 6543), with your database password in it
//   OWNER_PW_HASH optional; defaults to the owner hash already in the app
import { migrate } from "../server/src/db.js";
import { initCache } from "../server/src/cache.js";
import { handle } from "../server/src/app.js";

// Once per warm copy of the function: connect the session store and make sure the tables exist.
let ready = null;
const warm = () => (ready ||= (async () => {
  await initCache();
  try { await migrate(); } catch (e) { ready = null; console.error("[db] migration failed:", e.message); }
})());

export default async function (req, res) {
  // vercel.json rewrites /api/<x> to /api/index?__p=/api/<x>; put the original path back for the router.
  const u = new URL(req.url, "http://x");
  const p = u.searchParams.get("__p");
  if (p) { u.searchParams.delete("__p"); req.url = p + (u.search ? u.search : ""); }
  await warm();
  return handle(req, res);
}

export const config = { maxDuration: 60 };
