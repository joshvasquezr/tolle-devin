// ESV page windows (D§3.1 ESV windowing; SPEC §8.1 "500 verses or half a book", single-chapter books whole per docs/esv-compliance.md).
import { chapterVerses, getBook, verseCount, type BookId } from "./books.ts";

export interface EsvWindow {
  readonly part: number;
  readonly vStart: number;
  readonly vEnd: number;
}

/** Max verses one ESV request or page may show for this book. Single-chapter books are shown whole (Crossway, docs/esv-compliance.md). */
export function esvCap(book: BookId): number {
  const b = getBook(book);
  return b.chapters === 1 ? Math.min(500, verseCount(b)) : Math.min(500, Math.floor(verseCount(b) / 2));
}

/** Fewest balanced windows under the cap; `part` is 1-based. Throws RangeError for a bad chapter. */
export function esvWindows(book: BookId, chapter: number): EsvWindow[] {
  const verses = chapterVerses(getBook(book), chapter);
  if (verses === undefined) throw new RangeError(`no chapter ${chapter} in ${book}`);
  const cap = esvCap(book);
  const n = Math.ceil(verses / cap);
  const size = Math.ceil(verses / n);
  const out: EsvWindow[] = [];
  for (let start = 1, part = 1; start <= verses; start += size, part++) {
    out.push({ part, vStart: start, vEnd: Math.min(verses, start + size - 1) });
  }
  return out;
}

/** The window containing `verse` (for deep links like /esv/jude/1/20). */
export function esvPartForVerse(book: BookId, chapter: number, verse: number): number | undefined {
  return esvWindows(book, chapter).find((w) => verse >= w.vStart && verse <= w.vEnd)?.part;
}
