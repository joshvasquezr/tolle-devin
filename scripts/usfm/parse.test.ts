// D§6.2 USFM mapping, D§3.2 content model, SPEC R3 (no red-letter), R4 (footnotes).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { plainVerses, toBookId, type Block, type Chapter } from "@tolle/core";
import { parseUsfm, UsfmError } from "./parse.ts";

const SRC = new URL("../../data/sources/", import.meta.url).pathname;
function source(tr: string, code: string): string {
  const f = readdirSync(join(SRC, tr)).find((n) => n === `${code}.usfm` || n.includes(`-${code}`));
  if (!f) throw new Error(`no ${code} in ${tr}`);
  return readFileSync(join(SRC, tr, f), "utf8");
}
const chapter = (tr: "bsb" | "kjv" | "web", code: string, book: string, n: number): Chapter =>
  parseUsfm(source(tr, code), tr, toBookId(book))[n - 1]!;
const verseNums = (c: Chapter) => [...plainVerses(c).keys()];
const json = (c: Chapter) => JSON.stringify(c);

describe("fixtures from data/sources", () => {
  it("BSB John 3: 36 verses in prose, headings, footnotes, no markup or red letters", () => {
    const c = chapter("bsb", "JHN", "john", 3);
    expect(verseNums(c)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(c.blocks[0]).toEqual({ t: "h", text: "Jesus and Nicodemus" });
    expect(c.blocks.filter((b) => b.t === "h").length).toBeGreaterThanOrEqual(2);
    expect(c.blocks.some((b) => b.t === "p")).toBe(true);
    expect(c.notes?.length).toBeGreaterThan(0);
    expect(plainVerses(c).get(16)).toBe(
      "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.",
    );
    expect(json(c)).not.toMatch(/\\|wj|strong=/);
  });

  it("BSB Psalm 23: title block, poetry indents, stanza break, footnotes", () => {
    const c = chapter("bsb", "PSA", "psalms", 23);
    expect(c.blocks.map((b) => b.t)).toEqual(["h", "d", "q", "q"]);
    expect(c.blocks[1]).toEqual({ t: "d", items: [{ v: 1 }, "A Psalm of David."] });
    const q = c.blocks[2] as Extract<Block, { t: "q" }>;
    expect(q.lines[0]).toEqual({ i: 0, items: ["The LORD is my shepherd;", { fn: 0 }] });
    expect(q.lines[1]).toEqual({ i: 1, items: ["I shall not want."] });
    expect(c.notes).toHaveLength(3);
    expect(c.notes![1]).toBe("Or the valley of deep darkness");
    expect(verseNums(c)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("KJV Genesis 1: 31 verses, \\add text kept without markers", () => {
    const c = chapter("kjv", "GEN", "genesis", 1);
    expect(verseNums(c)).toHaveLength(31);
    expect(plainVerses(c).get(1)).toBe("In the beginning God created the heaven and the earth.");
    expect(json(c)).not.toMatch(/\\|add|strong=/);
  });

  it("KJV Psalm 23:1 keeps \\nd as { nd: 'LORD' }", () => {
    const c = chapter("kjv", "PSA", "psalms", 23);
    const q = c.blocks.find((b) => b.t === "q") as Extract<Block, { t: "q" }>;
    expect(q.lines[0]!.items).toEqual([{ v: 1 }, "The ", { nd: "LORD" }, " is my shepherd; I shall not want."]);
    expect(plainVerses(c).get(1)).toBe("The LORD is my shepherd; I shall not want.");
  });

  it("WEB words of Jesus (\\wj + nested \\+w) become plain text with intact words", () => {
    const c = chapter("web", "JHN", "john", 2);
    expect(plainVerses(c).get(16)).toContain("Don’t make my Father’s house a marketplace!”");
  });
});

describe("crafted USFM", () => {
  const book = toBookId("ruth");
  const p = (s: string) => parseUsfm(`\\id RUT test\n\\h Ruth\n${s}`, "bsb", book);

  it("headings before \\c 1 attach to chapter 1; \\b splits stanzas; \\s2 is a heading", () => {
    const [c] = p("\\ms BOOK I\n\\c 1\n\\s2 Sub\n\\q1 \\v 1 a\n\\q2 b\n\\b\n\\q1 \\v 2 c");
    expect(c!.blocks).toEqual([
      { t: "h", text: "BOOK I" },
      { t: "h", text: "Sub" },
      { t: "q", lines: [{ i: 0, items: [{ v: 1 }, "a"] }, { i: 1, items: ["b"] }] },
      { t: "q", lines: [{ i: 0, items: [{ v: 2 }, "c"] }] },
    ]);
  });

  it("footnotes become { fn } + notes text; \\r and \\x are dropped", () => {
    const [c] = p("\\c 1\n\\r (Gen 1)\n\\p \\v 1 word\\f + \\fr 1:1 \\ft Or \\fqa other\\f* end\\x - \\xo 1:1 \\xt Gen 1\\x*.");
    expect(c!.blocks).toEqual([{ t: "p", items: [{ v: 1 }, "word", { fn: 0 }, " end."] }]);
    expect(c!.notes).toEqual(["Or other"]);
  });

  it("text with no paragraph marker opens a prose block; NFC applied", () => {
    const [c] = p("\\c 1\n\\v 1 Cafe\u0301");
    expect(c!.blocks).toEqual([{ t: "p", items: [{ v: 1 }, "Café"] }]);
  });

  it.each([
    ["unknown marker", "\\c 1\n\\p \\v 1 a \\zz b"],
    ["chapter out of order", "\\c 2\n\\p \\v 1 a"],
    ["text before \\c 1", "\\p stray"],
    ["verse bridge", "\\c 1\n\\p \\v 1-2 a"],
    ["unterminated footnote", "\\c 1\n\\p \\v 1 a\\f + \\ft b"],
  ])("rejects %s", (_name, src) => {
    expect(() => p(src)).toThrow(UsfmError);
  });
});
