// Translation ↔ canonical versification (D§3.1 Versification, D§6.2).
// Identity by default; data/versemap/{tr}.json lists only the exceptions the
// build validator finds. Omitted verses keep their numbers and are just absent.
import { getBook, isBookId, type BookId } from "./books.ts";
import type { Translation } from "./types.ts";
import { encodeVerseId, isVerseId, toVerseId, type VerseId } from "./verseId.ts";
import bsb from "../data/versemap/bsb.json" with { type: "json" };
import esv from "../data/versemap/esv.json" with { type: "json" };
import kjv from "../data/versemap/kjv.json" with { type: "json" };
import web from "../data/versemap/web.json" with { type: "json" };

export interface VerseMapException {
  /** Book id, translation-local chapter and verse. */
  readonly book: string;
  readonly ch: number;
  readonly v: number;
  /** Canonical ids this local verse covers (≥ 1; > 1 when verses are merged). */
  readonly canonical: readonly number[];
}

export interface LocalVerse {
  readonly book: string;
  readonly ch: number;
  readonly v: number;
}

export interface VerseMapFile {
  readonly schema: number;
  readonly exceptions: readonly VerseMapException[];
  /** Local verses intentionally absent or empty in this translation (D§6.2). */
  readonly omitted?: readonly LocalVerse[];
}

interface VerseMap {
  readonly toCanon: ReadonlyMap<string, readonly VerseId[]>;
  readonly fromCanon: ReadonlyMap<number, { ch: number; v: number }>;
  readonly omitted: ReadonlySet<string>;
}

const FILES: Record<Translation, VerseMapFile> = { bsb, kjv, web, esv };
const cache = new Map<Translation, VerseMap>();

const key = (book: string, ch: number, v: number) => `${book}.${ch}.${v}`;

/** Validates a versemap file and indexes it both ways. Throws RangeError on bad data. */
export function buildVerseMap(file: VerseMapFile): VerseMap {
  if (file.schema !== 1) throw new RangeError(`unsupported versemap schema ${file.schema}`);
  const toCanon = new Map<string, readonly VerseId[]>();
  const fromCanon = new Map<number, { ch: number; v: number }>();
  for (const e of file.exceptions) {
    if (!isBookId(e.book)) throw new RangeError(`versemap: unknown book ${e.book}`);
    if (!Number.isInteger(e.ch) || e.ch < 1 || !Number.isInteger(e.v) || e.v < 1) {
      throw new RangeError(`versemap: bad local verse ${key(e.book, e.ch, e.v)}`);
    }
    if (e.canonical.length === 0) throw new RangeError(`versemap: empty mapping for ${key(e.book, e.ch, e.v)}`);
    const ids = e.canonical.map((id) => toVerseId(id));
    const k = key(e.book, e.ch, e.v);
    if (toCanon.has(k)) throw new RangeError(`versemap: duplicate ${k}`);
    toCanon.set(k, ids);
    for (const id of ids) {
      if (fromCanon.has(id)) throw new RangeError(`versemap: canonical ${id} mapped twice`);
      fromCanon.set(id, { ch: e.ch, v: e.v });
    }
  }
  const omitted = new Set<string>();
  for (const o of file.omitted ?? []) {
    if (!isBookId(o.book)) throw new RangeError(`versemap: unknown book ${o.book}`);
    const k = key(o.book, o.ch, o.v);
    if (!Number.isInteger(o.ch) || o.ch < 1 || !Number.isInteger(o.v) || o.v < 1) {
      throw new RangeError(`versemap: bad omitted verse ${k}`);
    }
    if (omitted.has(k) || toCanon.has(k)) throw new RangeError(`versemap: ${k} listed twice`);
    omitted.add(k);
  }
  return { toCanon, fromCanon, omitted };
}

function mapFor(tr: Translation): VerseMap {
  let m = cache.get(tr);
  if (!m) {
    m = buildVerseMap(FILES[tr]);
    cache.set(tr, m);
  }
  return m;
}

/** True if the translation intentionally omits (or leaves empty) this local verse. */
export function isOmitted(tr: Translation, book: BookId, ch: number, v: number): boolean {
  return mapFor(tr).omitted.has(key(getBook(book).id, ch, v));
}

/** Canonical ids for a translation-local verse; [] if it has no canonical counterpart or is omitted. */
export function toCanonical(tr: Translation, book: BookId, ch: number, v: number): VerseId[] {
  const hit = mapFor(tr).toCanon.get(key(getBook(book).id, ch, v));
  if (hit) return [...hit];
  if (isOmitted(tr, book, ch, v)) return [];
  try {
    return [encodeVerseId(book, ch, v)];
  } catch {
    return [];
  }
}

/** Translation-local (ch, v) for a canonical id, or null if the id is invalid. */
export function fromCanonical(tr: Translation, id: number): { ch: number; v: number } | null {
  if (!isVerseId(id)) return null;
  const hit = mapFor(tr).fromCanon.get(id);
  if (hit) return { ...hit };
  return { ch: Math.floor(id / 1_000) % 1_000, v: id % 1_000 };
}
