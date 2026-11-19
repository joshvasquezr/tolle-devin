// Reference parser (D§3.1 Reference parser; SPEC P2–P5, §5.3). Pure, no I/O.
import { BOOKS, bookByAlias, chapterVerses, ordinalValue, type Book, type BookId } from "./books.ts";

export interface Ref {
  readonly book: BookId;
  readonly chapter: number;
  /** Absent for a whole chapter. */
  readonly vStart?: number;
  /** Present only for a multi-verse range (vEnd > vStart). */
  readonly vEnd?: number;
}

export interface RefChoice {
  readonly book: BookId;
  readonly ref: Ref;
  readonly label: string;
}

export type ParseResult =
  | { kind: "ref"; ref: Ref; label: string }
  | { kind: "ambiguous"; candidates: RefChoice[] }
  | {
      kind: "invalid";
      reason: "chapter_out_of_range" | "verse_out_of_range";
      book: BookId;
      max: number;
      suggestion: Ref;
    }
  | { kind: "search"; query: string };

/** Tie-break for ambiguous prefixes (D§3.1 step 4): most-read books first. */
const POPULAR: readonly string[] = [
  "john", "psalms", "romans", "matthew", "genesis", "proverbs", "luke", "mark",
  "isaiah", "acts", "philippians", "ephesians", "hebrews", "james", "job",
  "joshua", "judges", "jeremiah", "galatians", "colossians",
];
const MAX_CANDIDATES = 3;

// Leading ordinal: digit forms may be glued to the word (`1cor`); Roman and
// spelled forms need a separator so `isa`/`iicor`-style words stay intact.
const INPUT_RE =
  /^(?:(1st|2nd|3rd|[123])\s*\.?\s*|(first|second|third|iii|ii|i)[\s.]+)?([a-z][a-z.'\s]*?)\s*\.?\s*(\d[\d\s:.,-]*)?$/;

type Tail =
  | { n: 0 }
  | { n: 1; a: number }
  | { n: 2; a: number; b: number }
  | { n: 3; a: number; b: number; c: number | undefined }
  | { n: 4; a: number; b: number }; // a-b on its own (verse range or chapter range)

function normalize(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTail(raw: string | undefined): Tail | null {
  if (raw === undefined) return { n: 0 };
  const t = raw
    .trim()
    .replace(/\s*[:.,]\s*/g, ":")
    .replace(/\s*-\s*/g, "-")
    .replace(/(\d) +(\d)/g, "$1:$2");
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d+)$/))) return { n: 1, a: +m[1]! };
  if ((m = t.match(/^(\d+):(\d+)$/))) return { n: 2, a: +m[1]!, b: +m[2]! };
  if ((m = t.match(/^(\d+):(\d+)-(\d+)?$/))) {
    return { n: 3, a: +m[1]!, b: +m[2]!, c: m[3] === undefined ? undefined : +m[3] };
  }
  if ((m = t.match(/^(\d+)-(\d+)?$/))) {
    return m[2] === undefined ? { n: 1, a: +m[1]! } : { n: 4, a: +m[1]!, b: +m[2]! };
  }
  // `c:v-c2:v2` crosses chapters; MVP keeps the start verse (stricter than guessing).
  if ((m = t.match(/^(\d+):(\d+)-\d+:\d+$/))) return { n: 2, a: +m[1]!, b: +m[2]! };
  return null;
}

let aliasIndex: readonly (readonly [string, Book])[] | undefined;
function aliases(): readonly (readonly [string, Book])[] {
  aliasIndex ??= BOOKS.flatMap((b) => b.aliases.map((a) => [a, b] as const));
  return aliasIndex;
}

function canonicalKey(b: Book): string {
  return b.name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rank(b: Book, key: string): number {
  const nameFirst = canonicalKey(b).startsWith(key) ? 0 : 1000;
  const pop = POPULAR.indexOf(b.id);
  return nameFirst + (pop === -1 ? POPULAR.length + b.order : pop);
}

/** Exact alias, else every book with an alias starting with `key` (≥ 2 chars). */
function resolveBooks(key: string): Book[] {
  const exact = bookByAlias(key);
  if (exact) return [exact];
  if (key.replace(/^[123]/, "").length < 2) return [];
  const hits = new Set<Book>();
  for (const [alias, book] of aliases()) if (alias.startsWith(key)) hits.add(book);
  return [...hits].sort((x, y) => rank(x, key) - rank(y, key));
}

/** Human label, e.g. `Romans 8:28`, `Psalm 23`, `1 Corinthians 13:4–7`, `Jude 5`. */
export function formatRef(ref: Ref): string {
  const b = BOOKS.find((x) => x.id === ref.book);
  if (!b) throw new RangeError(`unknown book: ${ref.book}`);
  const name = b.id === "psalms" ? "Psalm" : b.name;
  const verses =
    ref.vStart === undefined ? "" : ref.vEnd === undefined ? `${ref.vStart}` : `${ref.vStart}–${ref.vEnd}`;
  if (b.chapters === 1) return verses ? `${name} ${verses}` : name;
  return verses ? `${name} ${ref.chapter}:${verses}` : `${name} ${ref.chapter}`;
}

type Checked = { ok: true; ref: Ref } | { ok: false; result: ParseResult & { kind: "invalid" } };

function buildRef(book: Book, tail: Tail): Checked {
  let chapter: number;
  let vStart: number | undefined;
  let vEnd: number | undefined;
  const single = book.chapters === 1;
  switch (tail.n) {
    case 0: chapter = 1; break;
    case 1: if (single) { chapter = 1; vStart = tail.a; } else chapter = tail.a; break;
    case 2: chapter = tail.a; vStart = tail.b; break;
    case 3: chapter = tail.a; vStart = tail.b; vEnd = tail.c; break;
    case 4:
      // Single-chapter `jude 3-5` is a verse range; multi-chapter `john 3-4`
      // keeps the first chapter (multi-range is Could, SPEC §5.3).
      if (single) { chapter = 1; vStart = tail.a; vEnd = tail.b; } else chapter = tail.a;
      break;
  }
  const max = chapterVerses(book, chapter);
  if (max === undefined) {
    const suggestion: Ref = { book: book.id, chapter: chapter < 1 ? 1 : book.chapters };
    return {
      ok: false,
      result: { kind: "invalid", reason: "chapter_out_of_range", book: book.id, max: book.chapters, suggestion },
    };
  }
  if (vStart !== undefined && (vStart < 1 || vStart > max)) {
    const suggestion: Ref = { book: book.id, chapter, vStart: vStart < 1 ? 1 : max };
    return { ok: false, result: { kind: "invalid", reason: "verse_out_of_range", book: book.id, max, suggestion } };
  }
  // Open-ended, reversed or equal ends collapse to one verse; an end past the
  // chapter is clamped (SPEC §5.3 "ps 23:1-" row).
  if (vEnd !== undefined && vStart !== undefined) {
    vEnd = Math.min(vEnd, max);
    if (vEnd <= vStart) vEnd = undefined;
  }
  const ref: Ref =
    vStart === undefined
      ? { book: book.id, chapter }
      : vEnd === undefined
        ? { book: book.id, chapter, vStart }
        : { book: book.id, chapter, vStart, vEnd };
  return { ok: true, ref };
}

export function parseInput(input: string): ParseResult {
  const query = input.replace(/\s+/g, " ").trim();
  const head = normalize(input).split(";")[0]!.trim();
  const m = head.match(INPUT_RE);
  if (!m) return { kind: "search", query };
  const [, digitOrd, wordOrd, words, rawTail] = m;
  const ord = digitOrd ?? wordOrd;
  const ordinal = ord === undefined ? "" : String(ordinalValue(ord));
  const key = ordinal + words!.replace(/[\s.']/g, "");
  const books = resolveBooks(key);
  const tail = parseTail(rawTail);
  if (books.length === 0 || tail === null) return { kind: "search", query };

  if (books.length === 1) {
    const r = buildRef(books[0]!, tail);
    return r.ok ? { kind: "ref", ref: r.ref, label: formatRef(r.ref) } : r.result;
  }
  const candidates: RefChoice[] = [];
  for (const b of books) {
    const r = buildRef(b, tail);
    if (r.ok) candidates.push({ book: b.id, ref: r.ref, label: formatRef(r.ref) });
    if (candidates.length === MAX_CANDIDATES) break;
  }
  if (candidates.length === 0) return { kind: "search", query };
  if (candidates.length === 1) return { kind: "ref", ref: candidates[0]!.ref, label: candidates[0]!.label };
  return { kind: "ambiguous", candidates };
}
