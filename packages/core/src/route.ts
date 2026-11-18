// URL ↔ route, shared by Worker and client router (D§3.1 Route, D§2 routing; SPEC "URLs").
import { BOOKS, bookByAlias, chapterVerses, getBook, type Book, type BookId } from "./books.ts";
import { esvWindows } from "./esvWindows.ts";
import type { Ref } from "./parse.ts";
import { DEFAULT_TRANSLATION, isTranslation, type Translation } from "./types.ts";

export type Route =
  | { kind: "chapter"; tr: Translation; book: BookId; chapter: number; part?: number }
  | { kind: "verses"; tr: Translation; ref: Ref }
  | { kind: "redirect"; to: string; status: 301 | 302 }
  | { kind: "search" | "static" | "notfound" };

/** The subset of URLSearchParams the resolver reads (core has no DOM types). */
export interface QueryLike {
  get(name: string): string | null;
}

const STATIC_PAGES = new Set(["/", "/about", "/about/esv-copyright", "/privacy"]);
const STATIC_PREFIXES = ["/data/", "/_astro/", "/fonts/"];
const NOT_FOUND: Route = { kind: "notfound" };

const bySlug: ReadonlyMap<string, Book> = new Map(BOOKS.map((b) => [b.slug, b]));

/** '/bsb/1-corinthians/13/4-7'; ESV parts > 1 add '?part=n' (D§1 D5). */
export function formatPath(tr: Translation, ref: Ref, part?: number): string {
  const b = getBook(ref.book);
  let p = `/${tr}/${b.slug}/${ref.chapter}`;
  if (ref.vStart !== undefined) p += ref.vEnd === undefined ? `/${ref.vStart}` : `/${ref.vStart}-${ref.vEnd}`;
  if (tr === "esv" && part !== undefined && part > 1) p += `?part=${part}`;
  return p;
}

const POS_INT = /^[1-9]\d{0,2}$/;

function bookFromSegment(seg: string): { book: Book; canonical: boolean } | undefined {
  const exact = bySlug.get(seg);
  if (exact) return { book: exact, canonical: true };
  const lower = seg.toLowerCase();
  const b = bySlug.get(lower) ?? bookByAlias(lower.replace(/[-_.\s]/g, ""));
  return b ? { book: b, canonical: false } : undefined;
}

function redirect(to: string): Route {
  return { kind: "redirect", to, status: 301 };
}

export function resolveRoute(pathname: string, search: QueryLike): Route {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return NOT_FOUND;
  }
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "");
  if (STATIC_PAGES.has(path)) return { kind: "static" };
  if (path === "/search") return { kind: "search" };
  if (STATIC_PREFIXES.some((p) => path.startsWith(p))) return { kind: "static" };

  const segs = path.split("/").slice(1);
  if (segs.length === 0 || segs.some((s) => s === "")) return NOT_FOUND;

  let tr: Translation;
  let rest: string[];
  let trCanonical = true;
  const first = segs[0]!.toLowerCase();
  if (isTranslation(first) && segs.length >= 2) {
    tr = first;
    trCanonical = segs[0] === first;
    rest = segs.slice(1);
  } else {
    // `/{book}/{chapter}` → default translation (SPEC "URLs").
    tr = DEFAULT_TRANSLATION;
    trCanonical = false;
    rest = segs;
  }
  if (rest.length > 3) return NOT_FOUND;
  const found = bookFromSegment(rest[0]!);
  if (!found) return NOT_FOUND;
  const { book } = found;

  if (rest.length === 1) return redirect(`/${tr}/${book.slug}/1`);

  const chSeg = rest[1]!;
  if (!/^\d{1,3}$/.test(chSeg)) return NOT_FOUND;
  const chapter = Number(chSeg);
  const max = chapterVerses(book, chapter);
  if (max === undefined) return NOT_FOUND;

  let ref: Ref = { book: book.id, chapter };
  let versesCanonical = true;
  if (rest.length === 3) {
    const m = rest[2]!.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!m) return NOT_FOUND;
    const v1 = Number(m[1]);
    const v2 = m[2] === undefined ? undefined : Number(m[2]);
    if (v1 < 1 || v1 > max || (v2 !== undefined && (v2 < v1 || v2 > max))) return NOT_FOUND;
    versesCanonical = POS_INT.test(m[1]!) && (m[2] === undefined || (POS_INT.test(m[2]) && v2! > v1));
    ref = v2 === undefined || v2 === v1 ? { book: book.id, chapter, vStart: v1 } : { book: book.id, chapter, vStart: v1, vEnd: v2 };
  }

  let part: number | undefined;
  if (tr === "esv" && rest.length === 2) {
    const raw = search.get("part");
    if (raw !== null) {
      const parts = esvWindows(book.id, chapter).length;
      if (!POS_INT.test(raw) || Number(raw) > parts) return redirect(formatPath(tr, ref));
      part = Number(raw);
    }
  }

  if (!trCanonical || !found.canonical || !POS_INT.test(chSeg) || !versesCanonical) {
    return redirect(formatPath(tr, ref, part));
  }
  if (rest.length === 3) return { kind: "verses", tr, ref };
  return part === undefined ? { kind: "chapter", tr, book: book.id, chapter } : { kind: "chapter", tr, book: book.id, chapter, part };
}
