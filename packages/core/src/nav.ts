// SPEC R5: previous/next chapter across book boundaries; none before Genesis 1 or after Revelation 22.
import { BOOKS, getBook, type BookId } from "./books.ts";

export interface ChapterRef {
  readonly book: BookId;
  readonly chapter: number;
}

export function neighbors(book: BookId, chapter: number): { prev: ChapterRef | null; next: ChapterRef | null } {
  const b = getBook(book);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > b.chapters) throw new RangeError(`${book} ${chapter}`);
  const before = BOOKS[b.order - 2];
  const after = BOOKS[b.order];
  const prev = chapter > 1 ? { book: b.id, chapter: chapter - 1 } : before ? { book: before.id, chapter: before.chapters } : null;
  const next = chapter < b.chapters ? { book: b.id, chapter: chapter + 1 } : after ? { book: after.id, chapter: 1 } : null;
  return { prev, next };
}
