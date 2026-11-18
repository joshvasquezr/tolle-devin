// Build-time access to generated chapter JSON (P0.10 output in public/data).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { BOOKS, PD_TRANSLATIONS, plainVerses, type Book, type Chapter, type PdTranslation } from "@tolle/core";

// Resolved from the app root: the prerender bundle runs from dist/, so import.meta.url is not stable.
const DATA = new URL("public/data/", pathToFileURL(`${process.cwd()}/`));

export function loadChapter(tr: PdTranslation, book: Book, n: number): Chapter {
  return JSON.parse(readFileSync(new URL(`${tr}/${book.slug}/${n}.json`, DATA), "utf8")) as Chapter;
}

export interface ChapterParams {
  tr: PdTranslation;
  book: string;
  chapter: string;
}

export function chapterPaths(): { params: ChapterParams; props: { tr: PdTranslation; book: Book; n: number } }[] {
  return PD_TRANSLATIONS.flatMap((tr) =>
    BOOKS.flatMap((book) =>
      Array.from({ length: book.chapters }, (_, i) => ({
        params: { tr, book: book.slug, chapter: String(i + 1) },
        props: { tr, book, n: i + 1 },
      })),
    ),
  );
}

/** D§6.3: first verse(s), trimmed to 155 characters on a word boundary. */
export function describe(chapter: Chapter, max = 155): string {
  let out = "";
  for (const text of plainVerses(chapter).values()) {
    out = out ? `${out} ${text}` : text;
    if (out.length >= max) break;
  }
  if (out.length <= max) return out;
  const cut = out.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,;:]+$/, "")}…`;
}
