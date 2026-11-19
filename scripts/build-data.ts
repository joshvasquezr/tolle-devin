// Data build (D§6.1, D§6.2): data/sources/{tr}/*.usfm → apps/web/public/data/{tr}/{book}/{n}.json.
// Run: pnpm build:data [tr…]. Output is generated and git-ignored (AGENTS.md).
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BOOKS, PD_TRANSLATIONS, isPdTranslation, type Book, type Chapter, type PdTranslation } from "@tolle/core";
import { parseUsfm } from "./usfm/parse.ts";
import { validateTranslation } from "./validate.ts";
import { writeSearchIndex } from "./search-index.ts";

export const ROOT = new URL("..", import.meta.url).pathname;
export const SOURCES = join(ROOT, "data/sources");
export const OUT = join(ROOT, "apps/web/public/data");

const byUsfm = new Map<string, Book>(BOOKS.map((b) => [b.usfm, b]));

/** Parses all source books of one translation, keyed by book id, in canonical order. */
export interface ParsedTranslation {
  books: Map<Book, Chapter[]>;
  sources: Map<Book, string>;
}

export async function parseTranslation(tr: PdTranslation): Promise<ParsedTranslation> {
  const dir = join(SOURCES, tr);
  const out = new Map<Book, Chapter[]>();
  const sources = new Map<Book, string>();
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".usfm")).sort()) {
    const src = await readFile(join(dir, f), "utf8");
    const code = src.match(/^\uFEFF?\\id\s+(\S+)/)?.[1];
    const book = code === undefined ? undefined : byUsfm.get(code);
    if (!book) throw new Error(`${tr}/${f}: unknown or missing \\id ${code ?? ""}`);
    if (out.has(book)) throw new Error(`${tr}/${f}: duplicate book ${book.id}`);
    out.set(book, parseUsfm(src, tr, book.id));
    sources.set(book, src);
  }
  return { books: new Map([...out].sort(([a], [b]) => a.order - b.order)), sources };
}

export async function writeTranslation(tr: PdTranslation, books: Map<Book, Chapter[]>): Promise<number> {
  await rm(join(OUT, tr), { recursive: true, force: true });
  let n = 0;
  for (const [book, chapters] of books) {
    const dir = join(OUT, tr, book.slug);
    await mkdir(dir, { recursive: true });
    for (const c of chapters) {
      await writeFile(join(dir, `${c.chapter}.json`), JSON.stringify(c));
      n++;
    }
  }
  return n;
}

async function main(args: string[]): Promise<void> {
  const trs = args.length ? args : [...PD_TRANSLATIONS];
  for (const tr of trs) {
    if (!isPdTranslation(tr)) throw new Error(`not a public-domain translation: ${tr}`);
    const t0 = Date.now();
    const { books, sources } = await parseTranslation(tr);
    const errors = validateTranslation(tr, books, sources);
    if (errors.length) {
      throw new Error(`${tr}: ${errors.length} validation error(s)\n${errors.slice(0, 50).join("\n")}`);
    }
    const n = await writeTranslation(tr, books);
    const idx = await writeSearchIndex(OUT, tr, books);
    console.log(`${tr}: ${books.size} books, ${n} chapters, ${idx.name} (${(idx.gz / 1e6).toFixed(2)} MB gz) → ${join(OUT, tr)} (${Date.now() - t0} ms)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
