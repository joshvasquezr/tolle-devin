// D§3.11 query engine (pure; runs in the search Web Worker and in tests). SPEC S1, S3, S4, S7.
import MiniSearch from "minisearch";
import { BOOKS, SEARCH_INDEX_OPTIONS, adjacency, fold, getBook, words, type BookId, type PdTranslation } from "@tolle/core";

export interface SearchFile {
  v: 1;
  tr: PdTranslation;
  index: unknown;
  text: Record<string, string>;
}

export interface Engine {
  index: MiniSearch;
  text: Record<string, string>;
}

export interface Hit {
  id: number;
  text: string;
}

export interface Results {
  total: number;
  page: number;
  pages: number;
  hits: Hit[];
  /** Folded query words, for subtle match emphasis. */
  words: string[];
}

export const PAGE_SIZE = 25;

export function loadEngine(file: SearchFile): Engine {
  return { index: MiniSearch.loadJS(file.index as never, SEARCH_INDEX_OPTIONS), text: file.text };
}

/** Quoted parts are exact phrases (S3); everything is also an AND term query. */
export function parseQuery(q: string): { all: string; phrases: string[][] } {
  const phrases = [...q.matchAll(/["“]([^"”]+)["”]/g)].map((m) => words(m[1]!)).filter((p) => p.length);
  return { all: q.replace(/["“”]/g, " "), phrases };
}

/** S4 scope: "ot", "nt" or a book slug/id; anything else means all. */
export function scopeFilter(scope: string | undefined): (id: number) => boolean {
  if (scope === "ot" || scope === "nt") {
    const orders = new Set(BOOKS.filter((b) => b.testament === scope).map((b) => b.order));
    return (id) => orders.has(Math.floor(id / 1_000_000));
  }
  if (scope) {
    try {
      const order = getBook(scope as BookId).order;
      return (id) => Math.floor(id / 1_000_000) === order;
    } catch {
      /* unknown scope → all */
    }
  }
  return () => true;
}

function containsPhrase(verse: string[], phrase: string[]): boolean {
  outer: for (let i = 0; i + phrase.length <= verse.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (verse[i + j] !== phrase[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * AND of stemmed terms (OR only when AND finds nothing), exact-phrase filter, scope filter, then
 * BM25 × (1 + 2 × adjacency) with canonical order for ties (docs/spikes/search-index.md).
 */
export function search(engine: Engine, q: string, opts: { scope?: string | undefined; page?: number | undefined } = {}): Results {
  const { all, phrases } = parseQuery(q);
  const qWords = words(all);
  const inScope = scopeFilter(opts.scope);
  const wordsOf = (id: number) => words(engine.text[id] ?? "");
  let raw = qWords.length ? engine.index.search(all, { combineWith: "AND" }) : [];
  if (!raw.length && !phrases.length && qWords.length) raw = engine.index.search(all, { combineWith: "OR" });
  let cands: { id: number; score: number }[] = raw.map((r) => ({ id: r.id as number, score: r.score }));
  // Phrases made only of stopwords have no index terms: scan the stored text instead.
  if (!cands.length && phrases.length) cands = Object.keys(engine.text).map((k) => ({ id: Number(k), score: 1 }));
  const ranked = cands
    .filter((c) => inScope(c.id))
    .map((c) => ({ c, w: phrases.length || qWords.length > 1 ? wordsOf(c.id) : [] }))
    .filter(({ w }) => phrases.every((p) => containsPhrase(w, p)))
    .map(({ c, w }) => ({ id: c.id, s: c.score * (1 + 2 * adjacency(qWords, w)) }))
    .sort((a, b) => b.s - a.s || a.id - b.id);
  const pages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), pages);
  const hits = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ id }) => ({ id, text: engine.text[id] ?? "" }));
  return { total: ranked.length, page, pages, hits, words: [...new Set(qWords.map(fold))] };
}
