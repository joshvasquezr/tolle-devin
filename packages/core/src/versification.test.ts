// D§3.1 Versification: identity default, exceptions from data/versemap/{tr}.json.
import { describe, expect, it } from "vitest";
import { BOOKS, toBookId } from "./books.ts";
import { TRANSLATIONS } from "./types.ts";
import { encodeVerseId } from "./verseId.ts";
import { buildVerseMap, fromCanonical, toCanonical } from "./versification.ts";

const john = toBookId("john");

describe("versification", () => {
  it.each(TRANSLATIONS)("%s: identity for every canonical verse (empty exception file loads)", (tr) => {
    for (const b of BOOKS) {
      b.verses.forEach((n, i) => {
        for (const v of [1, n]) {
          const id = encodeVerseId(b.id, i + 1, v);
          expect(toCanonical(tr, b.id, i + 1, v)).toEqual([id]);
          expect(fromCanonical(tr, id)).toEqual({ ch: i + 1, v });
        }
      });
    }
  });

  it("a local verse outside canonical bounds maps to []; invalid ids map to null", () => {
    expect(toCanonical("bsb", john, 3, 37)).toEqual([]);
    expect(toCanonical("bsb", john, 22, 1)).toEqual([]);
    expect(fromCanonical("bsb", 43003037)).toBeNull();
    expect(fromCanonical("bsb", 0)).toBeNull();
  });

  it("exceptions index both ways, including merged verses", () => {
    const m = buildVerseMap({
      schema: 1,
      exceptions: [{ book: "3-john", ch: 1, v: 14, canonical: [64001014, 64001013] }],
    });
    expect(m.toCanon.get("3-john.1.14")).toEqual([64001014, 64001013]);
    expect(m.fromCanon.get(64001013)).toEqual({ ch: 1, v: 14 });
  });

  it("rejects bad exception data", () => {
    const bad = [
      { schema: 2, exceptions: [] },
      { schema: 1, exceptions: [{ book: "nope", ch: 1, v: 1, canonical: [43001001] }] },
      { schema: 1, exceptions: [{ book: "john", ch: 0, v: 1, canonical: [43001001] }] },
      { schema: 1, exceptions: [{ book: "john", ch: 1, v: 1, canonical: [] }] },
      { schema: 1, exceptions: [{ book: "john", ch: 1, v: 1, canonical: [43001099] }] },
      {
        schema: 1,
        exceptions: [
          { book: "john", ch: 1, v: 1, canonical: [43001001] },
          { book: "john", ch: 1, v: 2, canonical: [43001001] },
        ],
      },
    ];
    for (const f of bad) expect(() => buildVerseMap(f)).toThrow(RangeError);
  });
});
