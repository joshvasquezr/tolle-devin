// SPEC R5 neighbors over all 1,189 chapters.
import { describe, expect, it } from "vitest";
import { BOOKS, toBookId } from "./books.ts";
import { neighbors } from "./nav.ts";

describe("neighbors (R5)", () => {
  it("walks every chapter in canonical order both ways", () => {
    const all = BOOKS.flatMap((b) => Array.from({ length: b.chapters }, (_, i) => ({ book: b.id, chapter: i + 1 })));
    expect(all).toHaveLength(1189);
    all.forEach((c, i) => {
      const n = neighbors(c.book, c.chapter);
      expect(n.prev).toEqual(all[i - 1] ?? null);
      expect(n.next).toEqual(all[i + 1] ?? null);
    });
  });

  it("edges and book boundaries", () => {
    expect(neighbors(toBookId("genesis"), 1).prev).toBeNull();
    expect(neighbors(toBookId("revelation"), 22).next).toBeNull();
    expect(neighbors(toBookId("genesis"), 50).next).toEqual({ book: "exodus", chapter: 1 });
    expect(() => neighbors(toBookId("jude"), 2)).toThrow(RangeError);
  });
});
