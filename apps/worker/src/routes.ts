// P2.1 route fallback (D§1 D2, D§2 routing, D§6.3). Uses core's resolveRoute so server and client agree.
import { TRANSLATION_NAMES, formatPath, formatRef, getBook, isTranslation, plainVerses, resolveRoute, type Chapter, type Ref } from "@tolle/core";
import type { Env } from "./env.ts";
import { rewriteVerseHtml, trimDescription } from "./rewrite.ts";

const VERSES = /^\d{1,3}(?:-\d{1,3})?$/;
const DAY = 86_400;

const redirect = (to: string, status: 301 | 302) => new Response(null, { status, headers: { Location: to } });

/** `/bsb/john/3/99`: the chapter exists but the verse does not → 302 to the chapter. */
function outOfRangeVerse(url: URL): Response | null {
  const segs = url.pathname.replace(/\/+$/, "").split("/").slice(1);
  const trFirst = isTranslation(segs[0]?.toLowerCase() ?? "");
  if (segs.length !== (trFirst ? 4 : 3) || !VERSES.test(segs.at(-1)!)) return null;
  const r = resolveRoute(`/${segs.slice(0, -1).join("/")}`, url.searchParams);
  if (r.kind === "chapter") return redirect(formatPath(r.tr, { book: r.book, chapter: r.chapter }), 302);
  if (r.kind === "redirect") return redirect(r.to, 302);
  return null;
}

async function verses(req: Request, env: Env, tr: "bsb" | "kjv" | "web", ref: Ref): Promise<Response> {
  const origin = new URL(req.url).origin;
  const chapterPath = formatPath(tr, { book: ref.book, chapter: ref.chapter });
  const [page, data] = await Promise.all([
    env.ASSETS.fetch(new Request(origin + chapterPath)),
    env.ASSETS.fetch(new Request(`${origin}/data/${tr}/${getBook(ref.book).slug}/${ref.chapter}.json`)),
  ]);
  if (!page.ok || !data.ok) throw new Error(`asset ${page.status}/${data.status}`);
  const text = plainVerses((await data.json()) as Chapter);
  const end = ref.vEnd ?? ref.vStart!;
  const parts: string[] = [];
  for (let v = ref.vStart!; v <= end; v++) {
    const t = text.get(v);
    if (t) parts.push(t);
  }
  const label = formatRef(ref);
  const html = rewriteVerseHtml(await page.text(), {
    title: `${label} — ${TRANSLATION_NAMES[tr]}`,
    description: trimDescription(parts.join(" ")),
    canonical: new URL(formatPath(tr, ref), origin).href,
    focus: `${ref.vStart}-${end}`,
    crumbName: label,
  });
  // Keep the asset's security headers (dist/_headers CSP etc.); only body and caching change.
  const headers = new Headers(page.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", `public, max-age=${DAY}`);
  return new Response(html, { headers });
}

export async function notFound(req: Request, env: Env): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL("/404", req.url)));
  return new Response(page.ok ? page.body : "Not found", {
    status: 404,
    headers: { "Content-Type": page.ok ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

export async function handlePage(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const url = new URL(req.url);
  const route = resolveRoute(url.pathname, url.searchParams);
  switch (route.kind) {
    case "redirect":
      return redirect(route.to, route.status);
    case "verses": {
      // ESV pages are added (gated) in P5.
      if (route.tr === "esv") return notFound(req, env);
      const tr = route.tr;
      return cached(req, () => verses(req, env, tr, route.ref));
    }
    case "notfound":
      return outOfRangeVerse(url) ?? notFound(req, env);
    default:
      return notFound(req, env);
  }
}

/** Rewritten verse pages are cached for 24 h in the Cache API (D§6.3); PD only. */
async function cached(req: Request, make: () => Promise<Response>): Promise<Response> {
  const cache = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: Cache }).default;
  const hit = await cache?.match(req);
  if (hit) return hit;
  const res = await make();
  if (cache && req.method === "GET") await cache.put(req, res.clone());
  return res;
}
