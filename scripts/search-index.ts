// P3.2 (D§3.11, D§6.1): per-translation search index — MiniSearch over index terms plus stored verse
// text (docs/spikes/search-index.md). Emitted as /data/{tr}/search.v{hash}.json with a manifest.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import MiniSearch from "minisearch";
import { PD_TRANSLATIONS, indexTerms, plainVerses, toCanonical, type Book, type Chapter, type PdTranslation } from "@tolle/core";

/** SPEC S5 [A]: first-use download under 3 MB gz per translation. */
export const MAX_GZ_BYTES = 3_000_000;
export const MANIFEST = "search-manifest.json";

/** Options shared with the browser loader (apps/web/src/search). */
export const SEARCH_OPTIONS = { fields: ["text"], storeFields: [], tokenize: indexTerms, processTerm: (t: string) => t };

export interface SearchFile {
  v: 1;
  tr: PdTranslation;
  index: unknown;
  text: Record<number, string>;
}

export function buildSearchFile(tr: PdTranslation, books: Map<Book, Chapter[]>): { json: string; hash: string } {
  const docs: { id: number; text: string }[] = [];
  for (const [book, chapters] of books) {
    for (const c of chapters) {
      for (const [v, raw] of plainVerses(c)) {
        const id = toCanonical(tr, book.id, c.chapter, v)[0];
        const text = raw.replace(/\s+/g, " ").trim();
        if (id !== undefined && text) docs.push({ id, text });
      }
    }
  }
  docs.sort((a, b) => a.id - b.id);
  const index = new MiniSearch<{ id: number; text: string }>(SEARCH_OPTIONS);
  index.addAll(docs);
  const file: SearchFile = { v: 1, tr, index: index.toJSON(), text: Object.fromEntries(docs.map((d) => [d.id, d.text])) };
  const json = JSON.stringify(file);
  return { json, hash: createHash("sha256").update(json).digest("hex").slice(0, 10) };
}

export async function writeSearchIndex(out: string, tr: PdTranslation, books: Map<Book, Chapter[]>): Promise<{ name: string; gz: number }> {
  const { json, hash } = buildSearchFile(tr, books);
  const gz = gzipSync(json, { level: 9 }).length;
  if (gz > MAX_GZ_BYTES) throw new Error(`${tr}: search index ${gz} B gz exceeds ${MAX_GZ_BYTES} B (SPEC S5)`);
  const name = `search.v${hash}.json`;
  await writeFile(join(out, tr, name), json);
  const path = join(out, MANIFEST);
  const manifest = JSON.parse(await readFile(path, "utf8").catch(() => "{}")) as Record<string, string>;
  manifest[tr] = name;
  await writeFile(path, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort())));
  return { name, gz };
}

/** Size check over emitted files: every PD translation has exactly one index, within budget. */
export async function checkSearchIndexes(out: string): Promise<string[]> {
  const errors: string[] = [];
  const manifest = JSON.parse(await readFile(join(out, MANIFEST), "utf8").catch(() => "{}")) as Record<string, string>;
  for (const tr of PD_TRANSLATIONS) {
    const files = (await readdir(join(out, tr)).catch(() => [])).filter((f) => /^search\.v[0-9a-f]{10}\.json$/.test(f));
    if (files.length !== 1 || manifest[tr] !== files[0]) {
      errors.push(`${tr}: expected one search index matching the manifest, found ${files.join(", ") || "none"}`);
      continue;
    }
    const gz = gzipSync(await readFile(join(out, tr, files[0]!)), { level: 9 }).length;
    if (gz > MAX_GZ_BYTES) errors.push(`${tr}: ${files[0]} is ${gz} B gz > ${MAX_GZ_BYTES}`);
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { OUT } = await import("./build-data.ts");
  const errors = await checkSearchIndexes(OUT);
  for (const e of errors) console.error(e);
  if (errors.length) process.exit(1);
  console.log("search indexes ok");
}
