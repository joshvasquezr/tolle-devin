// ESV page windows (D§3.1 ESV windowing; SPEC §8.1 "500 verses or half a book").
import { chapterVerses, getBook, verseCount, type BookId } from "./books.js";

export interface EsvWindow {
  readonly part: number;
  readonly vStart: number;
  readonly vEnd: number;
}

/** Max verses one ESV request or page may show for this book. */
export function esvCap(book: BookId): number {
  return Math.min(500, Math.floor(verseCount(getBook(book)) / 2));
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
