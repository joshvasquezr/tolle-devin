// SPEC §8.1 half-book rule; D§3.1 ESV windowing invariants over all 1,189 chapters.
import { describe, expect, it } from "vitest";
import { BOOKS, toBookId, verseCount } from "./books.ts";
import { esvCap, esvPartForVerse, esvWindows } from "./esvWindows.ts";

const sizes = (b: string, ch: number) => esvWindows(toBookId(b), ch).map((w) => w.vEnd - w.vStart + 1);

describe("esvWindows", () => {
  it("D§3.1 example Haggai 2 12/11; single-chapter books are one window (Crossway: shown whole)", () => {
    expect(sizes("jude", 1)).toEqual([25]);
    expect(sizes("3-john", 1)).toEqual([14]);
    expect(sizes("haggai", 2)).toEqual([12, 11]);
  });

  it("single-chapter books cap at their full length: Jude 25, 2 John 13, 3 John 14, Philemon 25, Obadiah 21; Haggai keeps half (19)", () => {
    expect(["jude", "2-john", "3-john", "philemon", "obadiah", "haggai"].map((b) => esvCap(toBookId(b)))).toEqual([
      25, 13, 14, 25, 21, 19,
    ]);
  });

  it("for all 1,189 chapters: contiguous, cover each verse once, never exceed the cap (whole single-chapter books, else min(500, floor(book/2))), fewest windows", () => {
    let chapters = 0;
    for (const b of BOOKS) {
      const cap = b.chapters === 1 ? Math.min(500, verseCount(b)) : Math.min(500, Math.floor(verseCount(b) / 2));
      b.verses.forEach((n, i) => {
        const ws = esvWindows(b.id, i + 1);
        expect(ws[0]!.vStart).toBe(1);
        expect(ws.at(-1)!.vEnd).toBe(n);
        ws.forEach((w, k) => {
          expect(w.part).toBe(k + 1);
          expect(w.vEnd - w.vStart + 1).toBeLessThanOrEqual(cap);
          expect(w.vEnd).toBeGreaterThanOrEqual(w.vStart);
          if (k > 0) expect(w.vStart).toBe(ws[k - 1]!.vEnd + 1);
        });
        expect(ws.length).toBe(Math.ceil(n / cap));
        chapters++;
      });
    }
    expect(chapters).toBe(1189);
  });

  it("throws RangeError for a missing chapter", () => {
    expect(() => esvWindows(toBookId("jude"), 2)).toThrow(RangeError);
    expect(() => esvWindows(toBookId("john"), 0)).toThrow(RangeError);
  });

  it("esvPartForVerse finds the window of a verse", () => {
    expect(esvPartForVerse(toBookId("haggai"), 2, 1)).toBe(1);
    expect(esvPartForVerse(toBookId("haggai"), 2, 13)).toBe(2);
    expect(esvPartForVerse(toBookId("haggai"), 2, 23)).toBe(2);
    expect(esvPartForVerse(toBookId("haggai"), 2, 24)).toBeUndefined();
    expect(esvPartForVerse(toBookId("jude"), 1, 25)).toBe(1);
  });
});
