// P3.3 Verify: D§3.11 / SPEC S1, S3, S4, S7 against the real generated indexes; timing < 200 ms.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PD_TRANSLATIONS } from "@tolle/core";
import { PAGE_SIZE, loadEngine, parseQuery, search, type SearchFile } from "./query.ts";

const DATA = join(process.cwd(), "public/data");
// Needs generated data (`pnpm build:data`): skipped in the CI unit job, run in the build job after the build.
const HAVE_DATA = existsSync(join(DATA, "search-manifest.json"));
const engines: Record<string, ReturnType<typeof loadEngine>> = {};
if (HAVE_DATA) {
  const manifest = JSON.parse(readFileSync(join(DATA, "search-manifest.json"), "utf8")) as Record<string, string>;
  for (const tr of PD_TRANSLATIONS) engines[tr] = loadEngine(JSON.parse(readFileSync(join(DATA, tr, manifest[tr]!), "utf8")) as SearchFile);
}
const ids = (r: { hits: { id: number }[] }) => r.hits.map((h) => h.id);

describe.skipIf(!HAVE_DATA)("query engine (real indexes)", () => {
  it.each(PD_TRANSLATIONS)("S1: 'love your enemies' has Matthew 5:44 in the top 3 (%s), < 200 ms", (tr) => {
    const t0 = performance.now();
    const r = search(engines[tr]!, "love your enemies");
    expect(performance.now() - t0).toBeLessThan(200);
    expect(ids(r).slice(0, 3)).toContain(40005044);
  });
  it("AND semantics: every hit has every term (stemmed)", () => {
    const r = search(engines.kjv!, "faith works");
    expect(r.total).toBeGreaterThan(0);
    for (const h of r.hits) expect(h.text.toLowerCase()).toMatch(/faith[\s\S]*work|work[\s\S]*faith/);
  });
  it("OR fallback only when AND is empty (BSB says 'faith without deeds')", () => {
    expect(ids(search(engines.bsb!, "faith without works")).slice(0, 5).some((id) => Math.floor(id / 1000) === 59002)).toBe(true);
  });
  it("S3: quoted phrase filters to the exact phrase, stopwords included", () => {
    const r = search(engines.kjv!, '"in the beginning"');
    expect(ids(r)).toContain(1001001);
    expect(ids(r)).toContain(43001001);
    for (const h of r.hits) expect(h.text.toLowerCase()).toContain("in the beginning");
    expect(search(engines.kjv!, '"and it was so"').total).toBeGreaterThan(0);
    expect(parseQuery('grace "for by grace"').phrases).toEqual([["for", "by", "grace"]]);
  });
  it("S4: scope ot / nt / book", () => {
    const nt = search(engines.web!, "shepherd", { scope: "nt" });
    expect(nt.total).toBeGreaterThan(0);
    expect(nt.hits.every((h) => h.id >= 40_000_000)).toBe(true);
    const ot = search(engines.web!, "shepherd", { scope: "ot" });
    expect(ot.hits.every((h) => h.id < 40_000_000)).toBe(true);
    const ps = search(engines.web!, "shepherd", { scope: "psalms" });
    expect(ps.hits.every((h) => Math.floor(h.id / 1_000_000) === 19)).toBe(true);
  });
  it("S7: stemming and diacritics/possessives", () => {
    expect(search(engines.bsb!, "loved").total).toBe(search(engines.bsb!, "love").total);
    expect(search(engines.kjv!, "Jesus'").total).toBeGreaterThan(0);
    expect(search(engines.kjv!, "jésus").total).toBe(search(engines.kjv!, "jesus").total);
  });
  it("pagination: 25 per page, clamped", () => {
    const r1 = search(engines.kjv!, "lord", { page: 1 });
    const r2 = search(engines.kjv!, "lord", { page: 2 });
    expect(r1.hits).toHaveLength(PAGE_SIZE);
    expect(r1.pages).toBe(Math.ceil(r1.total / PAGE_SIZE));
    expect(ids(r2)[0]).not.toBe(ids(r1)[0]);
    expect(search(engines.kjv!, "lord", { page: 99999 }).page).toBe(r1.pages);
    expect(search(engines.kjv!, "zzzqqq").total).toBe(0);
  });
});
