// D§3.1 Route, D§2 request routing; SPEC "URLs".
import { describe, expect, it } from "vitest";
import { BOOKS, toBookId } from "./books.ts";
import { parseInput } from "./parse.ts";
import { formatPath, resolveRoute, type Route } from "./route.ts";
import { PD_TRANSLATIONS, TRANSLATIONS } from "./types.ts";

// Core has no DOM/Node types, so tests pass a get()-able stand-in for URLSearchParams.
const query = (s = "") => {
  const m = new Map(s.split("&").filter(Boolean).map((kv) => kv.split("=") as [string, string]));
  return { get: (n: string) => m.get(n) ?? null };
};
const r = (path: string, s = ""): Route => resolveRoute(path, query(s));
const john = toBookId("john");

describe("formatPath", () => {
  it("chapter, verse, range (SPEC URLs examples)", () => {
    expect(formatPath("bsb", { book: john, chapter: 3 })).toBe("/bsb/john/3");
    expect(formatPath("bsb", { book: john, chapter: 3, vStart: 16 })).toBe("/bsb/john/3/16");
    expect(formatPath("bsb", { book: toBookId("1-corinthians"), chapter: 13, vStart: 4, vEnd: 7 })).toBe(
      "/bsb/1-corinthians/13/4-7",
    );
  });
  it("ESV part > 1 adds ?part=n; PD ignores part", () => {
    expect(formatPath("esv", { book: toBookId("jude"), chapter: 1 }, 2)).toBe("/esv/jude/1?part=2");
    expect(formatPath("esv", { book: toBookId("jude"), chapter: 1 }, 1)).toBe("/esv/jude/1");
    expect(formatPath("bsb", { book: toBookId("jude"), chapter: 1 }, 2)).toBe("/bsb/jude/1");
  });
});

describe("resolveRoute", () => {
  it("chapter and verses", () => {
    expect(r("/bsb/john/3")).toEqual({ kind: "chapter", tr: "bsb", book: "john", chapter: 3 });
    expect(r("/kjv/song-of-solomon/2/")).toEqual({ kind: "chapter", tr: "kjv", book: "song-of-solomon", chapter: 2 });
    expect(r("/web/john/3/16")).toEqual({ kind: "verses", tr: "web", ref: { book: "john", chapter: 3, vStart: 16 } });
    expect(r("/bsb/1-corinthians/13/4-7")).toEqual({
      kind: "verses",
      tr: "bsb",
      ref: { book: "1-corinthians", chapter: 13, vStart: 4, vEnd: 7 },
    });
  });

  it("ESV chapter with a valid part; bad part redirects to part 1", () => {
    expect(r("/esv/jude/1", "part=3")).toEqual({ kind: "chapter", tr: "esv", book: "jude", chapter: 1, part: 3 });
    expect(r("/esv/jude/1", "part=4")).toEqual({ kind: "redirect", to: "/esv/jude/1", status: 301 });
    expect(r("/esv/jude/1", "part=x")).toEqual({ kind: "redirect", to: "/esv/jude/1", status: 301 });
    expect(r("/bsb/jude/1", "part=2")).toEqual({ kind: "chapter", tr: "bsb", book: "jude", chapter: 1 });
  });

  it("alias, case and number-form redirects (301) to the canonical slug", () => {
    const red = (to: string) => ({ kind: "redirect", to, status: 301 });
    expect(r("/bsb/jn/3")).toEqual(red("/bsb/john/3"));
    expect(r("/BSB/John/3")).toEqual(red("/bsb/john/3"));
    expect(r("/kjv/1cor/13/4-7")).toEqual(red("/kjv/1-corinthians/13/4-7"));
    expect(r("/bsb/songofsongs/1")).toEqual(red("/bsb/song-of-solomon/1"));
    expect(r("/bsb/john/03")).toEqual(red("/bsb/john/3"));
    expect(r("/bsb/john/3/16-16")).toEqual(red("/bsb/john/3/16"));
    expect(r("/bsb/john/3/016")).toEqual(red("/bsb/john/3/16"));
    expect(r("/bsb/john")).toEqual(red("/bsb/john/1"));
    expect(r("/esv/jd/1", "part=2")).toEqual(red("/esv/jude/1?part=2"));
  });

  it("default-translation redirects for /{book}/{chapter}[/{verses}]", () => {
    const red = (to: string) => ({ kind: "redirect", to, status: 301 });
    expect(r("/john/3")).toEqual(red("/bsb/john/3"));
    expect(r("/jn/3/16")).toEqual(red("/bsb/john/3/16"));
    expect(r("/john")).toEqual(red("/bsb/john/1"));
    expect(r("/1-corinthians/13/4-7")).toEqual(red("/bsb/1-corinthians/13/4-7"));
  });

  it("static and search", () => {
    for (const p of ["/", "/about", "/about/esv-copyright", "/privacy", "/data/bsb/john/3.json", "/about/"]) {
      expect(r(p).kind).toBe("static");
    }
    expect(r("/search", "q=love&t=bsb").kind).toBe("search");
  });

  it("notfound", () => {
    for (const p of [
      "/bsb/john/22", "/bsb/john/0", "/bsb/john/3/37", "/bsb/john/3/18-16", "/bsb/john/3/0",
      "/bsb/nope/1", "/xyz/john/3", "/bsb", "/esv", "/bsb/john/3/16/extra", "/bsb//3",
      "/bsb/john/3/a", "/bsb/john/3/16-", "/bsb/john/1e1", "/%E0%A4%A", "/api/v1/me", "/bsb/jude/2",
    ]) {
      expect(r(p), p).toEqual({ kind: "notfound" });
    }
  });

  it("parse → formatPath → resolveRoute round-trips for every chapter, all translations", () => {
    let n = 0;
    for (const b of BOOKS) {
      for (let ch = 1; ch <= b.chapters; ch++) {
        const input = `${b.name} ${b.chapters === 1 ? "" : ch}`;
        const p = parseInput(input);
        if (p.kind !== "ref") throw new Error(`${input} did not parse: ${p.kind}`);
        for (const tr of TRANSLATIONS) {
          expect(resolveRoute(formatPath(tr, p.ref), query())).toEqual({ kind: "chapter", tr, book: b.id, chapter: ch });
        }
        const last = b.verses[ch - 1]!;
        const range = { book: b.id, chapter: ch, vStart: 1, vEnd: last };
        for (const tr of PD_TRANSLATIONS) {
          expect(resolveRoute(formatPath(tr, range), query())).toEqual({ kind: "verses", tr, ref: range });
        }
        n++;
      }
    }
    expect(n).toBe(1189);
  });
});
