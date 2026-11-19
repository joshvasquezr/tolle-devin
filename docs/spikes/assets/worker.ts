// P0.12 toy Worker. Every response it produces carries `x-worker: 1`, so a
// response without that header was served by Static Assets without invoking it.
interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

async function route(req: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname.startsWith("/api/")) return Response.json({ worker: true, pathname });
  if (/^\/bsb\/john\/3\/\d+$/.test(pathname)) {
    const page = await env.ASSETS.fetch(new Request(new URL("/bsb/john/3", req.url)));
    const res = new Response(page.body, page);
    res.headers.set("x-rewritten", pathname);
    return res;
  }
  return new Response("worker 404", { status: 404 });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    console.log(`WORKER ${req.method} ${pathname}`);
    const res = await route(req, env, pathname);
    const out = new Response(res.body, res);
    out.headers.set("x-worker", "1");
    return out;
  },
};
