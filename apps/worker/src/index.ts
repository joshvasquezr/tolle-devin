export { EsvBudget } from "./esv/budget.ts";
// Worker entry (D§2). Asset hits never reach it: it sees unmatched paths (P2.1) and /api/* (P5, P6).
import type { Env } from "./env.ts";
import { handlePage } from "./routes.ts";
import { json, newLimits, requestLink, verifyLink } from "./auth/auth.ts";
import { devMailer, devOutbox, noMailer } from "./auth/mail.ts";
import { Limiter } from "./auth/ratelimit.ts";
import { handleAccount } from "./auth/account.ts";
import { handleSync } from "./highlights/api.ts";
import { purge } from "./db.ts";
import { handleMetrics } from "./metrics.ts";
import { esvEnabled, handleEsvPassage } from "./esv/passage.ts";

const limits = newLimits();
// Local `wrangler dev` only: every Playwright request shares one IP key, so the 20/hour limit would trip.
const devLimits = { email: new Limiter(1_000, 3_600_000), ip: new Limiter(10_000, 3_600_000) };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/v1/metrics") return handleMetrics(req, env.METRICS);
    if (env.DEV_MAIL === "1" && pathname === "/api/v1/dev/mail") return json(devOutbox.get(new URL(req.url).searchParams.get("to") ?? "") ?? null);
    if (pathname === "/api/v1/esv/passage" && esvEnabled(env)) return handleEsvPassage(req, env);
    if (env.DB && req.method === "POST") {
      const auth = { DB: env.DB, mailer: env.MAILER ?? (env.DEV_MAIL === "1" ? devMailer : noMailer), limits: env.DEV_MAIL === "1" ? devLimits : limits };
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
