// Data validators (D§6.2; SPEC §12, risk 11). The build fails on any error.
import {
  BOOKS,
  fromCanonical,
  isOmitted,
  toCanonical,
  type Block,
  type Book,
  type Chapter,
  type Item,
  type PdTranslation,
} from "@tolle/core";

const STRAY = /\\|\|\w+=|[\u0000-\u001f\u007f-\u009f]/;
const STRAIGHT_QUOTE = /["']/;
/** D§6.2 round-trip tolerance. */
export const ROUND_TRIP_TOLERANCE = 0.01;

function* blockItems(b: Block): Generator<Item[]> {
  if (b.t === "q") for (const l of b.lines) yield l.items;
  else if (b.t !== "h") yield b.items;
}

function* strings(c: Chapter): Generator<string> {
  for (const b of c.blocks) {
    if (b.t === "h") yield b.text;
    for (const items of blockItems(b)) {
      for (const it of items) {
        if (typeof it === "string") yield it;
        else if ("nd" in it) yield it.nd;
      }
    }
  }
  yield* c.notes ?? [];
}

/** Verse text keyed by number, accumulated in document order. */
function verses(c: Chapter, err: (m: string) => void): Map<number, string> {
  const out = new Map<number, string>();
  let v = 0;
  for (const b of c.blocks) {
    for (const items of blockItems(b)) {
      for (const it of items) {
        if (typeof it === "string" || "nd" in it) {
          const s = typeof it === "string" ? it : it.nd;
          if (v > 0) out.set(v, out.get(v)! + s);
        } else if ("v" in it) {
          if (it.v <= v) err(`verse ${it.v} after ${v}`);
          v = it.v;
          out.set(v, "");
        } else if (it.fn < 0 || it.fn >= (c.notes?.length ?? 0)) err(`footnote ${it.fn} has no note`);
      }
    }
  }
  return out;
}

/** Non-whitespace characters of a book's verse text, read straight from USFM (independent of the parser). */
export function sourceTextLength(usfm: string): number {
  let n = 0;
  for (const line of usfm.replace(/\\f\s.*?\\f\*|\\x\s.*?\\x\*/gs, "").split(/\r?\n/)) {
    const lead = line.match(/^\s*\\([a-z]+)\d*/)?.[1];
    // Book headers, headings, refs and titles without a verse carry no verse text.
    if (lead && /^(id|ide|usfm|h|toc|mt|s|ms|mr|r|sp|qa|cl|rem|d)$/.test(lead) && !/\\v\s/.test(line)) continue;
    const text = line
      .replace(/\|[^\\]*(?=\\\+?\w+\*)/g, "")
      .replace(/\\[cv]\s+\d+/g, "")
      .replace(/\\\+?[a-z]+\d*\*?/g, "");
    n += text.replace(/\s/g, "").length;
  }
  return n;
}

const plainLength = (vs: Map<number, string>) => [...vs.values()].join("").replace(/\s/g, "").length;

/** All validation errors for one translation; empty when the data is good. */
export function validateTranslation(
  tr: PdTranslation,
  books: ReadonlyMap<Book, readonly Chapter[]>,
  sources?: ReadonlyMap<Book, string>,
): string[] {
  const errors: string[] = [];
  for (const b of BOOKS) if (!books.has(b)) errors.push(`${tr}: missing book ${b.id}`);
  if (books.size !== BOOKS.length) errors.push(`${tr}: ${books.size} books, expected ${BOOKS.length}`);

  for (const [book, chapters] of books) {
    const at = (ch: number) => (m: string) => errors.push(`${tr} ${book.id} ${ch}: ${m}`);
    if (chapters.length !== book.chapters) {
      at(0)(`${chapters.length} chapters, expected ${book.chapters}`);
    }
    const covered = new Set<number>();
    let bookPlain = 0;
    chapters.forEach((c, i) => {
      const err = at(c.chapter);
      if (c.tr !== tr || c.book !== book.id || c.chapter !== i + 1) err(`header ${c.tr}/${c.book}/${c.chapter}`);
      for (const s of strings(c)) {
        if (STRAY.test(s)) err(`stray marker or control character in "${s.slice(0, 50)}"`);
        if (s !== s.normalize("NFC")) err(`non-NFC text "${s.slice(0, 50)}"`);
        if (STRAIGHT_QUOTE.test(s)) err(`straight quote in "${s.slice(0, 50)}"`);
      }
      const vs = verses(c, err);
      bookPlain += plainLength(vs);
      for (const [v, text] of vs) {
        if (isOmitted(tr, book.id, c.chapter, v)) {
          if (text.trim()) err(`verse ${v} is listed as omitted but has text`);
          continue;
        }
        if (!text.trim()) err(`empty verse ${v}`);
        const ids = toCanonical(tr, book.id, c.chapter, v);
        if (ids.length === 0) err(`verse ${v} has no canonical counterpart (add a versemap entry)`);
        for (const id of ids) {
          if (covered.has(id)) err(`verse ${v} duplicates canonical ${id}`);
          covered.add(id);
        }
      }
    });
    book.verses.forEach((count, ci) => {
      for (let v = 1; v <= count; v++) {
        const id = book.order * 1_000_000 + (ci + 1) * 1_000 + v;
        if (covered.has(id)) continue;
        const local = fromCanonical(tr, id);
        if (local && isOmitted(tr, book.id, local.ch, local.v)) continue;
        at(ci + 1)(`missing verse ${v} (canonical ${id})`);
      }
    });
    const src = sources?.get(book);
    if (src !== undefined) {
      const expected = sourceTextLength(src);
      const drift = Math.abs(bookPlain - expected) / expected;
      if (drift > ROUND_TRIP_TOLERANCE) {
        at(0)(`plain text ${bookPlain} chars vs source ${expected} (${(drift * 100).toFixed(2)}% > 1%)`);
      }
    }
  }
  return errors;
}
