export { EsvBudget } from "./esv/budget.ts";
// Worker entry (D§2). Asset hits never reach it: it sees unmatched paths (P2.1) and /api/* (P5, P6).
import type { Env } from "./env.ts";
import { handlePage } from "./routes.ts";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    return handlePage(req, env);
  },
};
