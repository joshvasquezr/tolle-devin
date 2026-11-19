// D§6.2 validators; SPEC §12 risk 11. Crafted bad inputs must fail the build.
import { beforeAll, describe, expect, it } from "vitest";
import { getBook, toBookId, type Block, type Book, type Chapter } from "@tolle/core";
import { parseTranslation, type ParsedTranslation } from "./build-data.ts";
import { sourceTextLength, validateTranslation } from "./validate.ts";

const parsed: Partial<Record<"bsb" | "kjv" | "web", ParsedTranslation>> = {};
beforeAll(async () => {
  for (const tr of ["bsb", "kjv", "web"] as const) parsed[tr] = await parseTranslation(tr);
});

const ruth = getBook(toBookId("ruth"));
const john = getBook(toBookId("john"));

/** KJV with one chapter replaced by `edit(copy)`; validation of the result. */
function withEdit(book: Book, ch: number, edit: (c: Chapter) => Chapter | null, src?: string): string[] {
  const { books, sources } = parsed.kjv!;
  const next = new Map(books);
  const chapters = books.get(book)!.map((c) => structuredClone(c));
  const edited = edit(chapters[ch - 1]!);
  if (edited) chapters[ch - 1] = edited;
  else chapters.splice(ch - 1, 1);
  next.set(book, chapters);
  const s = new Map(sources);
  if (src !== undefined) s.set(book, src);
  return validateTranslation("kjv", next, s);
}
const firstP = (c: Chapter) => c.blocks.find((b) => b.t === "p") as Extract<Block, { t: "p" }>;

describe("real data passes (D§6.2, PLAN P0.11 Verify)", () => {
  it.each(["bsb", "kjv", "web"] as const)("%s: no errors including the 1%% round trip", (tr) => {
    expect(validateTranslation(tr, parsed[tr]!.books, parsed[tr]!.sources)).toEqual([]);
  });
});

describe("crafted bad inputs fail", () => {
  it("missing book", () => {
    const books = new Map(parsed.kjv!.books);
    books.delete(ruth);
    expect(validateTranslation("kjv", books)).toEqual(expect.arrayContaining(["kjv: missing book ruth"]));
  });

  it("wrong chapter count", () => {
    expect(withEdit(ruth, 4, () => null).join("\n")).toMatch(/3 chapters, expected 4/);
  });

  it("missing verse (not in versemap)", () => {
    const errs = withEdit(john, 3, (c) => {
      const p = firstP(c);
      p.items = p.items.filter((it) => !(typeof it === "object" && "v" in it && it.v === 2));
      return c;
    });
    expect(errs.join("\n")).toMatch(/john 3: missing verse 2 \(canonical 43003002\)/);
  });

  it("extra verse beyond the canonical count", () => {
    const errs = withEdit(john, 3, (c) => {
      firstP(c).items.push({ v: 37 }, "extra");
      return c;
    });
    expect(errs.join("\n")).toMatch(/verse 37 has no canonical counterpart/);
  });

  it("empty verse", () => {
    const errs = withEdit(ruth, 1, (c) => {
      const p = firstP(c);
      const isV = (n: number) => (it: unknown) => typeof it === "object" && it !== null && "v" in it && it.v === n;
      const i = p.items.findIndex(isV(1));
      const j = p.items.findIndex(isV(2));
      p.items.splice(i + 1, j - i - 1);
      return c;
    });
    expect(errs.join("\n")).toMatch(/ruth 1: empty verse 1/);
  });

  it.each([
    ["stray marker", "word \\wj text", /stray marker/],
    ["control character", "word\u0007", /control character/],
    ["attribute residue", 'word|strong="H1"', /stray marker/],
    ["non-NFC", "Cafe\u0301", /non-NFC/],
    ["straight quote", 'said, "Go"', /straight quote/],
  ])("%s", (_name, text, re) => {
    expect(withEdit(ruth, 2, (c) => {
      firstP(c).items.push(text);
      return c;
    }).join("\n")).toMatch(re);
  });

  it("footnote marker without a note", () => {
    expect(withEdit(ruth, 2, (c) => {
      firstP(c).items.push({ fn: 999 });
      return c;
    }).join("\n")).toMatch(/footnote 999 has no note/);
  });

  it("verses out of order", () => {
    expect(withEdit(ruth, 2, (c) => {
      firstP(c).items.push({ v: 1 }, "again");
      return c;
    }).join("\n")).toMatch(/verse 1 after/);
  });

  it("plain text drifting > 1% from the source", () => {
    const src = parsed.kjv!.sources.get(ruth)!;
    const errs = withEdit(ruth, 1, (c) => c, `${src}\n\\p \\v 99 ${"x".repeat(sourceTextLength(src) / 50)}`);
    expect(errs.join("\n")).toMatch(/ruth 0: plain text \d+ chars vs source \d+ \(\d\.\d\d% > 1%\)/);
  });
});
