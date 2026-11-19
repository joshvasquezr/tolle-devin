// D§3.1 Versification: identity default, exceptions from data/versemap/{tr}.json.
import { describe, expect, it } from "vitest";
import { BOOKS, toBookId } from "./books.ts";
import { TRANSLATIONS } from "./types.ts";
import { encodeVerseId } from "./verseId.ts";
import { buildVerseMap, fromCanonical, isOmitted, toCanonical } from "./versification.ts";

const john = toBookId("john");

describe("versification", () => {
  it.each(TRANSLATIONS)("%s: identity for every canonical verse outside the exception file", (tr) => {
    for (const b of BOOKS) {
      if (tr === "web" && b.id === "romans") continue; // doxology, tested below
      b.verses.forEach((n, i) => {
        for (const v of [1, n]) {
          const id = encodeVerseId(b.id, i + 1, v);
          expect(toCanonical(tr, b.id, i + 1, v)).toEqual([id]);
          expect(fromCanonical(tr, id)).toEqual({ ch: i + 1, v });
        }
      });
    }
  });

  it("real data: WEB Romans doxology at 14:24–26, BSB and WEB omitted verses", () => {
    const romans = toBookId("romans");
    expect(toCanonical("web", romans, 14, 24)).toEqual([45016025]);
    expect(fromCanonical("web", 45016027)).toEqual({ ch: 14, v: 26 });
    expect(isOmitted("web", romans, 16, 25)).toBe(true);
    expect(toCanonical("web", romans, 16, 25)).toEqual([]);
    expect(isOmitted("bsb", toBookId("matthew"), 17, 21)).toBe(true);
    expect(toCanonical("bsb", toBookId("matthew"), 17, 21)).toEqual([]);
    expect(isOmitted("kjv", toBookId("matthew"), 17, 21)).toBe(false);
  });

  it("rejects bad omitted entries", () => {
    for (const omitted of [
      [{ book: "nope", ch: 1, v: 1 }],
      [{ book: "john", ch: 1, v: 0 }],
      [{ book: "john", ch: 1, v: 1 }, { book: "john", ch: 1, v: 1 }],
    ]) {
      expect(() => buildVerseMap({ schema: 1, exceptions: [], omitted })).toThrow(RangeError);
    }
    expect(() =>
      buildVerseMap({
        schema: 1,
        exceptions: [{ book: "john", ch: 1, v: 1, canonical: [43001001] }],
        omitted: [{ book: "john", ch: 1, v: 1 }],
      }),
    ).toThrow(RangeError);
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
