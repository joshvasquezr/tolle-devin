// P3.1 spike (D§12, docs/spikes/search-index.md): MiniSearch per PD translation. Run: node search-spike.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import MiniSearch from "minisearch";
import { BOOKS, PD_TRANSLATIONS, adjacency, indexTerms, plainVerses, words, toCanonical, type Chapter } from "@tolle/core";
import { ROOT } from "./build-data.ts";
const tk = indexTerms;
for (const tr of PD_TRANSLATIONS) {
  const docs: { id: number; text: string }[] = [];
  for (const b of BOOKS) for (let c = 1; c <= b.chapters; c++) {
    const ch = JSON.parse(await readFile(join(ROOT, "apps/web/public/data", tr, b.id, `${c}.json`), "utf8")) as Chapter;
    for (const [v, text] of plainVerses(ch)) { const id = toCanonical(tr, b.id, c, v)[0]; if (id !== undefined) docs.push({ id, text: text.trim() }); }
  }
  const t0 = performance.now();
  const idx = new MiniSearch({ fields: ["text"], storeFields: [], tokenize: tk, processTerm: (t) => t });
  idx.addAll(docs);
  const text = Object.fromEntries(docs.map((d) => [d.id, d.text]));
  const file = JSON.stringify({ index: idx, text });
  const buildMs = performance.now() - t0;
  const gz = gzipSync(file, { level: 9 }).length;
  const gzIdx = gzipSync(JSON.stringify(idx), { level: 9 }).length;
  const t1 = performance.now();
  const parsed = JSON.parse(file);
  const loaded = MiniSearch.loadJS(parsed.index, { fields: ["text"], storeFields: [], tokenize: tk, processTerm: (t) => t });
  const loadMs = performance.now() - t1;
  const query = (q: string) => {
    const qw = words(q);
    const and = loaded.search(q, { combineWith: "AND" });
    return (and.length ? and : loaded.search(q, { combineWith: "OR" }))
      .map((r) => ({ id: r.id as number, s: r.score * (1 + 2 * adjacency(qw, words(parsed.text[r.id]))) }))
      .sort((a, b) => b.s - a.s || a.id - b.id);
  };
  const t2 = performance.now();
  const runs = ["love your enemies", "faith without works", "grace", "the lord is my shepherd", "loved"];
  for (let i = 0; i < 10; i++) for (const s of runs) query(s);
  const queryMs = (performance.now() - t2) / 50;
  console.log(JSON.stringify({ tr, gzTotalMB: +(gz / 1e6).toFixed(2), gzIndexMB: +(gzIdx / 1e6).toFixed(2), buildMs: Math.round(buildMs), loadMs: Math.round(loadMs), avgQueryMs: +queryMs.toFixed(2), mt544Rank: query("love your enemies").findIndex((r) => r.id === 40005044) + 1, top3: query("love your enemies").slice(0, 3).map((r) => r.id), fw: query("faith without works").slice(0, 3).map((r) => r.id), shepherd: query("the lord is my shepherd").slice(0, 2).map((r) => r.id) }));
}
