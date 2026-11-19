// P3.2: deterministic output, canonical ids, stored text, size check (D§3.11; SPEC S5).
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import { getBook, type Book, type Chapter } from "@tolle/core";
import { SEARCH_OPTIONS, buildSearchFile, checkSearchIndexes, writeSearchIndex, type SearchFile } from "./search-index.ts";

const ch = (book: string, chapter: number, verses: string[]): Chapter =>
  ({ tr: "bsb", book: getBook(book as never).id, chapter, blocks: [{ t: "p", items: verses.flatMap((t, i) => [{ v: i + 1 }, t]) }] }) as Chapter;

const books = () =>
  new Map<Book, Chapter[]>([
    [getBook("matthew" as never), [ch("matthew", 5, ["Blessed are the poor in spirit,", "But I tell you, love your enemies"])]],
    [getBook("james" as never), [ch("james", 2, ["Faith without deeds is dead."])]],
  ]);

describe("search index builder", () => {
  it("is deterministic (same input → same hash)", () => {
    const a = buildSearchFile("bsb", books());
    const b = buildSearchFile("bsb", books());
    expect(a.hash).toBe(b.hash);
    expect(a.json).toBe(b.json);
    expect(a.hash).toMatch(/^[0-9a-f]{10}$/);
  });
  it("stores canonical ids and verse text; the index loads and stems", () => {
    const f = JSON.parse(buildSearchFile("bsb", books()).json) as SearchFile;
    expect(f.text[40005002]).toBe("But I tell you, love your enemies");
    const idx = MiniSearch.loadJS(f.index as never, SEARCH_OPTIONS);
    expect(idx.search("enemy loved", { combineWith: "AND" }).map((r) => r.id)).toEqual([40005002]);
    expect(idx.search("deed", { combineWith: "AND" }).map((r) => r.id)).toEqual([59002001]);
  });
  it("writes a hashed file + manifest; size check passes only when complete", async () => {
    const out = await mkdtemp(join(tmpdir(), "search-"));
    for (const tr of ["bsb", "kjv", "web"]) await mkdir(join(out, tr));
    const { name } = await writeSearchIndex(out, "bsb", books());
    expect(JSON.parse(await readFile(join(out, "search-manifest.json"), "utf8"))).toEqual({ bsb: name });
    expect((await checkSearchIndexes(out)).length).toBe(2);
    await writeSearchIndex(out, "kjv", books());
    await writeSearchIndex(out, "web", books());
    expect(await checkSearchIndexes(out)).toEqual([]);
    await writeFile(join(out, "web", "search.v0000000000.json"), "{}");
    expect(await checkSearchIndexes(out)).toHaveLength(1);
  });
});
