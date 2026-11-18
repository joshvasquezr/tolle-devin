// Verse identity (D§3.1 Verse ID, D§1 D3): bookOrder*1_000_000 + chapter*1_000 + verse.
// Bounds come from books.json, so every VerseId names a real canonical verse.
import { bookByOrder, chapterVerses, getBook, type BookId } from "./books.ts";

declare const verseIdBrand: unique symbol;

/** A validated canonical verse id, e.g. 43003016 = John 3:16. */
export type VerseId = number & { readonly [verseIdBrand]: true };

export interface VerseRef {
  readonly book: BookId;
  readonly chapter: number;
  readonly verse: number;
}

function split(id: number): { order: number; chapter: number; verse: number } {
  return {
    order: Math.floor(id / 1_000_000),
    chapter: Math.floor(id / 1_000) % 1_000,
    verse: id % 1_000,
  };
}

/** True when `id` is an integer naming an existing canonical verse. */
export function isVerseId(id: unknown): id is VerseId {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return false;
  const { order, chapter, verse } = split(id);
  const book = bookByOrder(order);
  if (!book) return false;
  const max = chapterVerses(book, chapter);
  return max !== undefined && verse >= 1 && verse <= max;
}

/** Validates untrusted input (sync payloads, IndexedDB keys). Throws RangeError. */
export function toVerseId(id: unknown): VerseId {
  if (!isVerseId(id)) throw new RangeError(`invalid verse id: ${String(id)}`);
  return id;
}

export function encodeVerseId(book: BookId, chapter: number, verse: number): VerseId {
  const b = getBook(book);
  const max = chapterVerses(b, chapter);
  if (max === undefined) throw new RangeError(`${b.name} has no chapter ${chapter}`);
  if (!Number.isInteger(verse) || verse < 1 || verse > max) {
    throw new RangeError(`${b.name} ${chapter} has no verse ${verse}`);
  }
  return (b.order * 1_000_000 + chapter * 1_000 + verse) as VerseId;
}

export function decodeVerseId(id: number): VerseRef {
  const valid = toVerseId(id);
  const { order, chapter, verse } = split(valid);
  // Non-null: toVerseId checked the book exists.
  return { book: bookByOrder(order)!.id, chapter, verse };
}

/** Inclusive [first, last] ids of a chapter, for range reads (D§3.10 Paint). */
export function chapterVerseIdRange(book: BookId, chapter: number): [VerseId, VerseId] {
  const max = chapterVerses(getBook(book), chapter);
  if (max === undefined) throw new RangeError(`no chapter ${chapter} in ${book}`);
  return [encodeVerseId(book, chapter, 1), encodeVerseId(book, chapter, max)];
}
