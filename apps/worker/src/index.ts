// P1.8 minimal Worker (D§2). Asset hits never reach it; it answers unmatched paths with the 404 page.
// Route handling (aliases, verse rewrites) arrives in P2.1; the API in P5/P6.
import type { Env } from "./env.ts";

export async function notFound(req: Request, env: Env): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL("/404", req.url)));
  return new Response(page.ok ? page.body : "Not found", {
    status: 404,
    headers: { "Content-Type": page.ok ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    return notFound(req, env);
  },
};
