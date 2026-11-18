// Content model (D§3.2). Chapter JSON uses these short keys on disk (D§4.1).
import type { BookId } from "./books.js";

export const TRANSLATIONS = ["bsb", "kjv", "web", "esv"] as const;
export type Translation = (typeof TRANSLATIONS)[number];

/** Public-domain translations: static files, search index, service worker (SPEC T4). */
export const PD_TRANSLATIONS = ["bsb", "kjv", "web"] as const satisfies readonly Translation[];
export type PdTranslation = (typeof PD_TRANSLATIONS)[number];

export const DEFAULT_TRANSLATION: PdTranslation = "bsb";

export function isTranslation(s: string): s is Translation {
  return (TRANSLATIONS as readonly string[]).includes(s);
}

export function isPdTranslation(s: string): s is PdTranslation {
  return (PD_TRANSLATIONS as readonly string[]).includes(s);
}

export type Item =
  | string // plain text
  | { v: number } // verse starts here
  | { nd: string } // divine name, small caps
  | { fn: number }; // footnote marker, index into Chapter.notes

export interface Line {
  i: 0 | 1 | 2 | 3;
  items: Item[];
}

export type Block =
  | { t: "h"; text: string } // section heading
  | { t: "d"; items: Item[] } // psalm title, unnumbered
  | { t: "p"; items: Item[] } // prose paragraph
  | { t: "q"; lines: Line[] }; // poetry stanza

export interface Chapter {
  tr: Translation;
  book: BookId;
  chapter: number;
  blocks: Block[];
  notes?: string[];
  range?: [number, number]; // ESV window
  parts?: number;
  part?: number;
}
