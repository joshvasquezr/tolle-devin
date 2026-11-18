// Chapter <main> content shared by the static build and the client router (D§3.8), so both emit identical markup.
import { TRANSLATION_NAMES, formatPath, formatRef, getBook, neighbors, type BookId, type Chapter, type ChapterRef, type Translation } from "@tolle/core";
import { escapeHtml, renderChapter } from "@tolle/render";

export const chapterLabel = (book: BookId, n: number): string => formatRef({ book, chapter: n });
export const chapterTitle = (tr: Translation, book: BookId, n: number): string => `${chapterLabel(book, n)} — ${TRANSLATION_NAMES[tr]}`;

// SPEC R5: links absent at Genesis 1 / Revelation 22, shown as disabled placeholders.
function navHtml(tr: Translation, prev: ChapterRef | null, next: ChapterRef | null): string {
  const link = (r: ChapterRef, rel: "prev" | "next") =>
    `<a class="btn" rel="${rel}" href="${escapeHtml(formatPath(tr, r))}">${rel === "prev" ? "← " : ""}${escapeHtml(formatRef(r))}${rel === "next" ? " →" : ""}</a>`;
  return (
    `<nav class="chnav" aria-label="Chapters">` +
    (prev ? link(prev, "prev") : `<span class="btn" aria-disabled="true">← Previous</span>`) +
    (next ? link(next, "next") : `<span class="btn" aria-disabled="true">Next →</span>`) +
    `</nav>`
  );
}

export function chapterMainHtml(chapter: Chapter): string {
  const { tr, book, chapter: n } = chapter;
  getBook(book);
  const { prev, next } = neighbors(book, n);
  return `<h1 class="ch"><button type="button" class="ch-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="picker">${escapeHtml(chapterLabel(book, n))}</button></h1>\n${renderChapter(chapter)}\n${navHtml(tr, prev, next)}`;
}
