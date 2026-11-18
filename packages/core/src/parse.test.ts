// SPEC P2–P5, §5.3 parser table; D§3.1 Reference parser. Contract: test-vectors/refs.json.
import { describe, expect, it } from "vitest";
import rawVectors from "../../../test-vectors/refs.json" with { type: "json" };
import { formatRef, parseInput, type ParseResult, type Ref } from "./parse.js";
import { toBookId } from "./books.js";

interface Case {
  input: string;
  kind: ParseResult["kind"];
  ref?: { book: string; chapter: number; vStart?: number; vEnd?: number };
  label?: string;
  books?: string[];
  reason?: string;
  book?: string;
  max?: number;
  suggestion?: { book: string; chapter: number; vStart?: number };
  query?: string;
}
const cases = (rawVectors as { cases: Case[] }).cases;

function actualShape(r: ParseResult): Case {
  switch (r.kind) {
    case "ref":
      return { input: "", kind: "ref", ref: { ...r.ref }, label: r.label };
    case "ambiguous":
      return { input: "", kind: "ambiguous", books: r.candidates.map((c) => c.book) };
    case "invalid":
      return { input: "", kind: "invalid", reason: r.reason, book: r.book, max: r.max, suggestion: { ...r.suggestion } };
    case "search":
      return { input: "", kind: "search", query: r.query };
  }
}

describe("parseInput — shared vectors (test-vectors/refs.json)", () => {
  it("has ≥ 300 cases covering every result kind", () => {
    expect(cases.length).toBeGreaterThanOrEqual(300);
    for (const k of ["ref", "ambiguous", "invalid", "search"]) {
      expect(cases.some((c) => c.kind === k)).toBe(true);
    }
  });

  it.each(cases.map((c) => [c.input, c] as const))("%j", (_input, c) => {
    expect({ ...actualShape(parseInput(c.input)), input: c.input }).toEqual(c);
  });
});

describe("parseInput — SPEC §5.3 acceptance rows", () => {
  const label = (s: string) => {
    const r = parseInput(s);
    return r.kind === "ref" ? r.label : r.kind;
  };
  it.each(["jn 3", "John 3", "john3", "Jn.3"])("%s → John 3", (s) => expect(label(s)).toBe("John 3"));
  it.each(["romans 8:28", "rom 8 28", "Rom8.28"])("%s → Romans 8:28", (s) => expect(label(s)).toBe("Romans 8:28"));
  it.each(["1 cor 13:4-7", "1cor13:4-7", "I Cor 13:4–7", "first corinthians 13.4-7"])(
    "%s → 1 Corinthians 13:4–7",
    (s) => expect(label(s)).toBe("1 Corinthians 13:4–7"),
  );
  it.each(["ps 23", "psalm 23", "psalms 23", "pslm 23"])("%s → Psalm 23", (s) => expect(label(s)).toBe("Psalm 23"));
  it("gen → Genesis 1", () => expect(label("gen")).toBe("Genesis 1"));
  it("matt 5:3-12; 6:9 → first range only", () => expect(label("matt 5:3-12; 6:9")).toBe("Matthew 5:3–12"));
  it("jude 5, obadiah 3: number is a verse", () => {
    expect(label("jude 5")).toBe("Jude 5");
    expect(label("obadiah 3")).toBe("Obadiah 3");
  });
  it("trailing dash is a single verse", () => {
    expect(label("ps 23:1-")).toBe("Psalm 23:1");
    expect(label("john 3:16-")).toBe("John 3:16");
  });
  it("P4: 'ph' offers Philippians first, then Philemon (≤ 3)", () => {
    const r = parseInput("ph");
    expect(r.kind).toBe("ambiguous");
    if (r.kind !== "ambiguous") return;
    expect(r.candidates.map((c) => c.label)).toEqual(["Philippians 1", "Philemon"]);
  });
  it("P5: 'Genesis 99' → Genesis has 50 chapters, offers Genesis 50", () => {
    expect(parseInput("Genesis 99")).toEqual({
      kind: "invalid",
      reason: "chapter_out_of_range",
      book: "genesis",
      max: 50,
      suggestion: { book: "genesis", chapter: 50 },
    });
  });
});

describe("parseInput — properties", () => {
  it("never returns more than 3 ambiguous candidates", () => {
    for (const s of ["j", "jo", "ju", "ma", "ph", "e", "ez", "co", "th", "1 j", "2 th"]) {
      const r = parseInput(s);
      if (r.kind === "ambiguous") expect(r.candidates.length).toBeLessThanOrEqual(3);
    }
  });

  it("formatRef labels round-trip through the parser", () => {
    const refs: Ref[] = [
      { book: toBookId("song-of-solomon"), chapter: 2, vStart: 4 },
      { book: toBookId("1-corinthians"), chapter: 13, vStart: 4, vEnd: 7 },
      { book: toBookId("3-john"), chapter: 1, vStart: 4 },
      { book: toBookId("psalms"), chapter: 119 },
    ];
    for (const ref of refs) {
      const r = parseInput(formatRef(ref));
      expect(r.kind === "ref" && r.ref).toEqual(ref);
    }
  });

  it("parses in < 1 ms per input (mean over all vectors)", () => {
    for (const c of cases) parseInput(c.input); // warm up
    const rounds = 5;
    const t0 = Date.now();
    for (let i = 0; i < rounds; i++) for (const c of cases) parseInput(c.input);
    const mean = (Date.now() - t0) / (rounds * cases.length);
    expect(mean).toBeLessThan(1);
  });
});
