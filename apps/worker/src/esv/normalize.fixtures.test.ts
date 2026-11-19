// P5.2 · D§3.12 Normalizer against live ESV fixtures captured in P5.1 (docs/spikes/esv.md).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeEsv } from "./normalize.ts";

const load = (name: string) =>
  (JSON.parse(readFileSync(new URL(`../../test/fixtures/esv/${name}.json`, import.meta.url), "utf8")) as { passages: string[] }).passages.join("");
const json = (b: unknown) => JSON.stringify(b);
const verses = (b: unknown) => [...json(b).matchAll(/\{"v":(\d+)\}/g)].map((m) => Number(m[1]));

describe("normalizeEsv on live fixtures", () => {
  it.each([
    ["john-3", 36],
    ["psalm-23", 6],
    ["proverbs-3", 35],
    ["jude-1", 25],
  ])("%s: every verse marker 1..n once, in order, no HTML in output", (name, n) => {
    const blocks = normalizeEsv(load(name));
    expect(verses(blocks)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(json(blocks)).not.toMatch(/<|&[a-z#0-9]+;/i);
  });
  it("Matthew 17 omits verse 21 (versemap) and keeps the rest", () => {
    const v = verses(normalizeEsv(load("matthew-17")));
    expect(v).not.toContain(21);
    expect(v).toHaveLength(26);
  });
  // Live ESV marks divine-name only inside headings; verse text carries it as plain "LORD" (docs/spikes/esv.md).
  it("poetry: Psalm 23 has a title, indented poetry lines, and the divine name kept as text", () => {
    const blocks = normalizeEsv(load("psalm-23"));
    expect(blocks.some((b) => b.t === "d")).toBe(true);
    const q = blocks.filter((b) => b.t === "q");
    expect(q.length).toBeGreaterThan(0);
    expect(json(q)).toMatch(/"i":1/);
    expect(json(q)).toContain("LORD");
    expect(blocks[0]).toEqual({ t: "h", text: "The Lord Is My Shepherd" });
  });
  it("prose: John 3 has headings and paragraphs only", () => {
    const blocks = normalizeEsv(load("john-3"));
    expect(blocks.filter((b) => b.t === "h").length).toBe(3);
    expect(blocks.every((b) => b.t === "h" || b.t === "p")).toBe(true);
  });
});
