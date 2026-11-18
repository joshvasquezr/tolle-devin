export { EsvBudget } from "./esv/budget.ts";
// Worker entry (D§2). Asset hits never reach it: it sees unmatched paths (P2.1) and /api/* (P5, P6).
import type { Env } from "./env.ts";
import { handlePage } from "./routes.ts";
import { json, newLimits, requestLink, verifyLink } from "./auth/auth.ts";
import { noMailer } from "./auth/mail.ts";
import { handleAccount } from "./auth/account.ts";
import { handleSync } from "./highlights/api.ts";
import { purge } from "./db.ts";

const limits = newLimits();

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (env.DB && req.method === "POST") {
      const auth = { DB: env.DB, mailer: env.MAILER ?? noMailer, limits };
      if (pathname === "/api/v1/auth/request") return requestLink(req, auth, Date.now());
      if (pathname === "/api/v1/auth/verify") return verifyLink(req, auth, Date.now());
    }
    if (env.DB && pathname.startsWith("/api/v1/")) {
      const r = (await handleAccount(req, env.DB, Date.now())) ?? (await handleSync(req, env.DB, Date.now()));
      if (r) return r;
    }
    if (pathname.startsWith("/api/")) {
      if (pathname.startsWith("/api/v1/")) return json({ error: "not_found" }, 404);
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    return handlePage(req, env);
  },
  // D§4.2 daily cron: expired tokens/sessions and 30-day-old tombstones.
  async scheduled(_event: unknown, env: Env): Promise<void> {
    if (env.DB) await purge(env.DB, Date.now());
  },
};
