// D§6.3 descriptions; P1.3 page set (3 × 1,189).
import { describe as suite, expect, it } from "vitest";
import { toBookId, type Chapter } from "@tolle/core";
import { chapterPaths, describe } from "./chapters.ts";

const ch = (texts: string[]): Chapter => ({
  tr: "bsb",
  book: toBookId("john"),
  chapter: 3,
  blocks: [{ t: "p", items: texts.flatMap((t, i) => [{ v: i + 1 }, t]) }],
});

suite("chapter pages", () => {
  it("one path per public-domain chapter, slug URLs", () => {
    const paths = chapterPaths();
    expect(paths).toHaveLength(3 * 1189);
    expect(paths).toContainEqual(expect.objectContaining({ params: { tr: "bsb", book: "john", chapter: "3" } }));
    expect(paths.some((p) => (p.params.tr as string) === "esv")).toBe(false);
  });

  it("description joins first verses and trims to ≤ 155 chars on a word boundary", () => {
    expect(describe(ch(["Short.", "Second."]))).toBe("Short. Second.");
    const long = describe(ch(["word ".repeat(30).trim(), "more ".repeat(30).trim()]));
    expect(long.length).toBeLessThanOrEqual(155);
    expect(long.endsWith("word…") || long.endsWith("more…")).toBe(true);
  });
});
