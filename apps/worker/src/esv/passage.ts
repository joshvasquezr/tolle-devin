// P5.4 · D§3.12 Passage flow: validate with core → per-visitor limit → DO cache (500-verse total)
// → single-flight → budget → upstream (key in header only) → normalize → cache. Errors per D§3.12.
import { ESV_CITATION, esvWindows, getBook, isBookId, type Block } from "@tolle/core";
import type { DoNamespace, Env } from "../env.ts";
import { Limiter } from "../auth/ratelimit.ts";
import { sha256Hex } from "../auth/crypto.ts";
import { normalizeEsv } from "./normalize.ts";

export const ESV_API_BASE = "https://api.esv.org/v3/";
// Final options from the P5.1 spike (docs/spikes/esv.md).
export const ESV_OPTIONS: Readonly<Record<string, string>> = {
  "include-passage-references": "false",
  "include-verse-numbers": "true",
  "include-first-verse-numbers": "true",
  "include-footnotes": "false",
  "include-footnote-body": "false",
  "include-headings": "true",
  "include-subheadings": "true",
  "include-chapter-numbers": "false",
  "include-book-titles": "false",
  "include-crossrefs": "false",
  "include-surrounding-chapters": "false",
  "include-surrounding-chapters-below": "false",
  "include-audio-link": "false",
  "include-short-copyright": "false",
  "include-copyright": "false",
  "include-css-link": "false",
  "inline-styles": "false",
  "wrapping-div": "false",
};

type Outcome = Block[] | "busy" | "unavailable";
export interface EsvDeps {
  fetch: typeof fetch;
  now: () => number;
  visitors: Limiter;
  inflight: Map<string, Promise<Outcome>>;
}
// D§3.12 per-visitor throttle, 20/min per hashed IP key [A]; per isolate until the rate-limiting binding is wired.
export const defaults: EsvDeps = { fetch: (i, n) => fetch(i, n), now: Date.now, visitors: new Limiter(20, 60_000), inflight: new Map() };

export type EsvEnv = Env & { ESV_API_KEY: string; ESV_BUDGET: DoNamespace };
export const esvEnabled = (env: Env): env is EsvEnv => env.ESV_ENABLED === "1" && !!env.ESV_API_KEY && !!env.ESV_BUDGET;

export const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": status === 200 ? "private, max-age=300" : "no-store", "X-Robots-Tag": "noindex" },
  });
export const int = (s: string | null) => (s !== null && /^[1-9]\d{0,2}$/.test(s) ? Number(s) : 0);

export async function handleEsvPassage(req: Request, env: EsvEnv, deps: EsvDeps = defaults): Promise<Response> {
  if (req.method !== "GET") return reply({ error: "bad_request" }, 400);
  const q = new URL(req.url).searchParams;
  const book = q.get("book") ?? "";
  const chapter = int(q.get("chapter"));
  const part = q.has("part") ? int(q.get("part")) : 1;
  if (!isBookId(book) || chapter < 1 || chapter > getBook(book).chapters || part < 1) return reply({ error: "bad_request" }, 400);
  const windows = esvWindows(book, chapter);
  const w = windows[part - 1];
  if (!w) return reply({ error: "bad_request" }, 400);
  const now = deps.now();
  if (!deps.visitors.allow(await sha256Hex(req.headers.get("CF-Connecting-IP") ?? "unknown"), now)) return reply({ error: "rate_limited" }, 429);

  const stub = env.ESV_BUDGET.get(env.ESV_BUDGET.idFromName("global"));
  const key = `esv:v1:${book}:${chapter}:${part}`;
  const hit = (await (await stub.fetch(`https://esv-budget/cache?key=${encodeURIComponent(key)}`)).json()) as { blocks: Block[] | null };
  let out: Outcome | null = hit.blocks;
  if (!out) {
    let p = deps.inflight.get(key);
    if (!p) {
      p = miss(env, stub, deps, key, book, chapter, w.vStart, w.vEnd).finally(() => deps.inflight.delete(key));
      deps.inflight.set(key, p);
    }
    out = await p;
  }
  if (out === "busy") return reply({ error: "esv_busy" }, 503);
  if (out === "unavailable") return reply({ error: "esv_unavailable" }, 503);
  return reply({ tr: "esv", book, chapter, part, parts: windows.length, range: [w.vStart, w.vEnd], blocks: out, copyright: ESV_CITATION });
}

async function miss(env: EsvEnv, stub: ReturnType<DoNamespace["get"]>, deps: EsvDeps, key: string, book: string, chapter: number, vStart: number, vEnd: number): Promise<Outcome> {
  const budget = (await (await stub.fetch("https://esv-budget/consume", { method: "POST", body: JSON.stringify({ kind: "passage" }) })).json()) as { ok: boolean };
  if (!budget.ok) return "busy";
  const b = getBook(book as Parameters<typeof getBook>[0]);
  // Explicit chapter:verse range so single-chapter books are not read as book+verse (spike: "Jude 1" = verse 1).
  const params = new URLSearchParams({ q: `${b.name} ${chapter}:${vStart}-${vEnd}`, ...ESV_OPTIONS });
  try {
    const res = await deps.fetch(`${env.ESV_UPSTREAM ?? ESV_API_BASE}passage/html/?${params}`, { headers: { Authorization: `Token ${env.ESV_API_KEY}` } });
    if (!res.ok) return "unavailable";
    const data = (await res.json()) as { parsed?: number[][]; passages?: string[] };
    // Never serve more than the requested window: the upstream range must sit inside it.
    const base = b.order * 1_000_000 + chapter * 1_000;
    const r = data.parsed?.[0];
    if (data.parsed?.length !== 1 || !r || r[0]! < base + vStart || r[1]! > base + vEnd || !data.passages?.length) return "unavailable";
    const blocks = normalizeEsv(data.passages.join(""));
    await stub.fetch("https://esv-budget/cache", { method: "PUT", body: JSON.stringify({ key, blocks, verses: vEnd - vStart + 1 }) });
    return blocks;
  } catch {
    return "unavailable";
  }
}
