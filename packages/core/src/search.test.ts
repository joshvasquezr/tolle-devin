// SPEC S7: stemming and diacritics tolerance; builder and query share these functions.
import { describe, expect, it } from "vitest";
import { fold, stem, terms, words } from "./search.ts";

describe("search text (SPEC S7)", () => {
  it("folds diacritics and case", () => {
    expect(fold("Élohîm ÁBBA")).toBe("elohim abba");
  });
  it("drops possessives and apostrophes", () => {
    expect(words("Jesus' word, the Lord’s day, don't")).toEqual(["jesus", "word", "the", "lord", "day", "dont"]);
  });
  it.each([
    ["loved", "love"], ["love", "love"], ["loves", "love"], ["loving", "love"],
    ["enemies", "enemy"], ["enemy", "enemy"], ["blessed", "bless"], ["blessing", "bless"],
    ["hoped", "hope"], ["hopping", "hop"], ["agreed", "agree"], ["caresses", "caress"],
    ["faith", "faith"], ["jesus", "jesus"], ["sins", "sin"], ["is", "is"],
  ])("stem(%s) = %s", (w, s) => {
    expect(stem(w)).toBe(s);
  });
  it("loved and love match; query and index agree", () => {
    expect(terms("They LOVED")).toEqual(terms("they love"));
    expect(terms("love your enemies")).toEqual(["love", "your", "enemy"]);
  });
});

describe("index terms and adjacency (D§3.11)", () => {
  it("drops stopwords", async () => {
    const { indexTerms } = await import("./search.ts");
    expect(indexTerms("Love your enemies and pray for them")).toEqual(["love", "enemy", "pray"]);
    expect(indexTerms("in the beginning")).toEqual(["begin"]);
  });
  it("scores in-order adjacency", async () => {
    const { adjacency } = await import("./search.ts");
    const q = words("love your enemies");
    expect(adjacency(q, words("But I tell you, love your enemies and pray"))).toBe(1);
    expect(adjacency(q, words("hate your enemies, love them"))).toBe(1 / 2);
    expect(adjacency(q, words("enemies your love"))).toBe(0);
    expect(adjacency(["grace"], words("grace"))).toBe(0);
  });
});
