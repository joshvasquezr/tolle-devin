// PLAN P0.4 · D§3.1 Verse ID, D§3.2 · SPEC H4 (translation-independent ids).
import { describe, expect, expectTypeOf, it } from "vitest";
import { BOOKS, toBookId } from "./books.ts";
import type { Block, Chapter, Item, Line, Translation } from "./types.ts";
import { isTranslation, PD_TRANSLATIONS, TRANSLATIONS } from "./types.ts";
import {
  chapterVerseIdRange,
  decodeVerseId,
  encodeVerseId,
  isVerseId,
  toVerseId,
  type VerseId,
} from "./verseId.ts";
import rawVectors from "../../../test-vectors/verse-ids.json" with { type: "json" };

type Vectors = {
  valid: { book: string; chapter: number; verse: number; id: number }[];
  invalid: { id: number; why: string }[];
};
const vectors: Vectors = rawVectors;

describe("verse ids round-trip (PLAN P0.4)", () => {
  it("encode → decode round-trips for all 31,102 verses, ids strictly increasing", () => {
    let count = 0;
    let prev = 0;
    for (const b of BOOKS) {
      b.verses.forEach((n, i) => {
        for (let v = 1; v <= n; v++) {
          const id = encodeVerseId(b.id, i + 1, v);
          expect(id).toBeGreaterThan(prev);
          prev = id;
          const back = decodeVerseId(id);
          if (back.book !== b.id || back.chapter !== i + 1 || back.verse !== v) {
            throw new Error(`round-trip failed at ${b.id} ${i + 1}:${v}`);
          }
          count++;
        }
      });
    }
    expect(count).toBe(31102);
  });
});

describe("shared vectors (test-vectors/verse-ids.json)", () => {
  it("has 10–20 valid and some invalid cases", () => {
    expect(vectors.valid.length).toBeGreaterThanOrEqual(10);
    expect(vectors.valid.length).toBeLessThanOrEqual(20);
    expect(vectors.invalid.length).toBeGreaterThan(0);
  });

  it.each(vectors.valid)("$book $chapter:$verse = $id", ({ book, chapter, verse, id }) => {
    expect(encodeVerseId(toBookId(book), chapter, verse)).toBe(id);
    expect(decodeVerseId(id)).toEqual({ book, chapter, verse });
    expect(isVerseId(id)).toBe(true);
  });

  it.each(vectors.invalid)("rejects $id ($why)", ({ id }) => {
    expect(isVerseId(id)).toBe(false);
    expect(() => decodeVerseId(id)).toThrow(RangeError);
    expect(() => toVerseId(id)).toThrow(RangeError);
  });
});

describe("validation", () => {
  const john = toBookId("john");
  it("encode throws RangeError out of range", () => {
    expect(() => encodeVerseId(john, 0, 1)).toThrow(RangeError);
    expect(() => encodeVerseId(john, 22, 1)).toThrow(RangeError);
    expect(() => encodeVerseId(john, 3, 37)).toThrow(RangeError);
    expect(() => encodeVerseId(john, 3, 0)).toThrow(RangeError);
    expect(() => encodeVerseId(john, 3, 1.5)).toThrow(RangeError);
  });

  it("isVerseId rejects non-numbers", () => {
    for (const x of ["43003016", null, undefined, NaN, Infinity, {}]) expect(isVerseId(x)).toBe(false);
  });

  it("chapterVerseIdRange covers the chapter", () => {
    expect(chapterVerseIdRange(john, 3)).toEqual([43003001, 43003036]);
    expect(() => chapterVerseIdRange(john, 22)).toThrow(RangeError);
  });

  it("VerseId is branded: a raw number is not assignable", () => {
    expectTypeOf<number>().not.toMatchTypeOf<VerseId>();
    expectTypeOf<VerseId>().toMatchTypeOf<number>();
  });
});

describe("content types match D§3.2", () => {
  it("Translation is bsb | kjv | web | esv", () => {
    expectTypeOf<Translation>().toEqualTypeOf<"bsb" | "kjv" | "web" | "esv">();
    expect([...TRANSLATIONS]).toEqual(["bsb", "kjv", "web", "esv"]);
    expect([...PD_TRANSLATIONS]).toEqual(["bsb", "kjv", "web"]);
    expect(isTranslation("esv")).toBe(true);
    expect(isTranslation("niv")).toBe(false);
  });

  it("accepts every block and item shape", () => {
    const items: Item[] = ["text", { v: 1 }, { nd: "Lord" }, { fn: 0 }];
    const line: Line = { i: 2, items };
    const blocks: Block[] = [
      { t: "h", text: "The New Birth" },
      { t: "d", items: ["A Psalm of David."] },
      { t: "p", items },
      { t: "q", lines: [line] },
    ];
    const ch: Chapter = { tr: "bsb", book: toBookId("john"), chapter: 3, blocks, notes: ["n"] };
    const esv: Chapter = { ...ch, tr: "esv", range: [1, 36], parts: 1, part: 1 };
    expect(JSON.parse(JSON.stringify(esv))).toEqual(esv);
    // @ts-expect-error indent levels are 0..3
    const bad: Line = { i: 4, items: [] };
    void bad;
  });
});
