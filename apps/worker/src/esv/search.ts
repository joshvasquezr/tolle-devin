// P5.5 · D§3.12 ESV search (SPEC S6): proxied, shares the budget (refused from soft on), nothing cached.
import { BOOKS, ESV_CITATION, esvCap, parseInput } from "@tolle/core";
import { sha256Hex } from "../auth/crypto.ts";
import { defaults, int, reply, type EsvDeps, type EsvEnv } from "./passage.ts";

export const ESV_SEARCH_UPSTREAM = "https://api.esv.org/v3/passage/search/";
// One page may be all from one book, so it must fit the smallest per-book cap (Haggai 19, 2 John 13).
export const SEARCH_PAGE_SIZE = Math.min(10, ...BOOKS.map((b) => esvCap(b.id)));

export async function handleEsvSearch(req: Request, env: EsvEnv, deps: EsvDeps = defaults): Promise<Response> {
  if (req.method !== "GET") return reply({ error: "bad_request" }, 400);
  const sp = new URL(req.url).searchParams;
  const query = (sp.get("q") ?? "").replace(/\s+/g, " ").trim();
  const page = sp.has("page") ? int(sp.get("page")) : 1;
  if (!query || query.length > 200 || page < 1) return reply({ error: "bad_request" }, 400);
  const now = deps.now();
  if (!deps.visitors.allow(await sha256Hex(req.headers.get("CF-Connecting-IP") ?? "unknown"), now)) return reply({ error: "rate_limited" }, 429);

  const stub = env.ESV_BUDGET.get(env.ESV_BUDGET.idFromName("global"));
  const budget = (await (await stub.fetch("https://esv-budget/consume", { method: "POST", body: JSON.stringify({ kind: "search" }) })).json()) as { ok: boolean };
  if (!budget.ok) return reply({ error: "esv_busy" }, 503);
  try {
    const params = new URLSearchParams({ q: query, "page-size": String(SEARCH_PAGE_SIZE), page: String(page) });
    const res = await deps.fetch(`${ESV_SEARCH_UPSTREAM}?${params}`, { headers: { Authorization: `Token ${env.ESV_API_KEY}` } });
    if (!res.ok) return reply({ error: "esv_unavailable" }, 503);
    const data = (await res.json()) as { total_pages?: number; results?: { reference?: unknown; content?: unknown }[] };
    const results = [];
    for (const r of (data.results ?? []).slice(0, SEARCH_PAGE_SIZE)) {
      if (typeof r.reference !== "string" || typeof r.content !== "string") continue;
      const p = parseInput(r.reference);
      if (p.kind !== "ref" || p.ref.vStart === undefined) continue;
      results.push({ book: p.ref.book, chapter: p.ref.chapter, verse: p.ref.vStart, text: r.content.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() });
    }
    return reply({ query, page, pages: Math.max(0, Math.trunc(Number(data.total_pages) || 0)), results, copyright: ESV_CITATION });
  } catch {
    return reply({ error: "esv_unavailable" }, 503);
  }
}
