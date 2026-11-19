// P7.3 / D§9 "Compliance checks" (SPEC §7, AGENTS "No monetization"): the built site has no ad,
// donation or third-party script patterns, and dev-only switches never reach the deploy config.
// P5.8 adds the ESV checks (D§9): no key, no ESV text, no ESV data or sitemap URLs, a noindex shell.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT = /\.(html|js|mjs|css|json|xml|txt|svg|webmanifest)$|^_headers$|^_redirects$/;

export const RULES: { name: string; re: RegExp }[] = [
  { name: "ad network", re: /googlesyndication|doubleclick\.net|adsbygoogle|amazon-adsystem|adservice\.google|carbonads|buysellads|taboola|outbrain/i },
  { name: "donation link", re: /paypal\.(me|com\/donate)|patreon\.com|ko-fi\.com|buymeacoffee\.com|givebutter|liberapay\.com|opencollective\.com|github\.com\/sponsors|href\s*=\s*["'][^"']*donat|>\s*(donate|support us|sponsor us)\s*</i },
  { name: "analytics/tracker", re: /google-analytics\.com|googletagmanager\.com|gtag\(|plausible\.io|segment\.(io|com)|mixpanel|hotjar|clarity\.ms|connect\.facebook\.net|static\.cloudflareinsights\.com/i },
  { name: "third-party script", re: /<script\b[^>]*\bsrc\s*=\s*["']?(https?:)?\/\//i },
  { name: "third-party stylesheet/frame", re: /<(link\b[^>]*rel=["']?stylesheet[^>]*href|iframe\b[^>]*src)\s*=\s*["']?(https?:)?\/\//i },
  { name: "remote import", re: /\bimport\s*\(?\s*["'](https?:)?\/\//i },
];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // Scripture data is checked by the data validators; scanning ~100 MB of verse JSON for words
      // like "donation" would flag Bible text, not monetization.
      if (relative(dir, p) === "data") continue;
      yield* files(p);
    } else if (TEXT.test(name)) yield p;
  }
}

export function checkDist(dist: string): string[] {
  const out: string[] = [];
  for (const f of files(dist)) {
    const text = readFileSync(f, "utf8");
    for (const r of RULES) {
      const m = r.re.exec(text);
      if (m) out.push(`${relative(dist, f)}: ${r.name} (${m[0].slice(0, 60)})`);
    }
  }
  return out;
}

/** Dev-only switches (the Playwright mail sink) must not appear in the deployable Worker config. */
export function checkWorkerConfig(jsonc: string): string[] {
  return /DEV_MAIL/.test(jsonc) ? ["wrangler.jsonc: DEV_MAIL must only be passed to local wrangler dev"] : [];
}

// ---- P5.8 ESV checks -------------------------------------------------------------------------------
// ESV text is recognised by 8-word shingles of the P5.1 fixtures (real ESV, within Crossway's limits),
// minus any shingle that also occurs in the public-domain data, so shared wording never trips the check.
const SHINGLE = 8;
const words = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .toLowerCase()
    .replace(/[’']/g, "")
    .match(/[a-z]+/g) ?? [];

function* shingles(text: string): Generator<string> {
  const w = words(text);
  for (let i = 0; i + SHINGLE <= w.length; i++) yield w.slice(i, i + SHINGLE).join(" ");
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function esvFingerprints(fixturesDir: string, pdDataDir?: string): Set<string> {
  const set = new Set<string>();
  for (const f of readdirSync(fixturesDir).filter((n) => n.endsWith(".json"))) {
    const passages = (JSON.parse(readFileSync(join(fixturesDir, f), "utf8")) as { passages: string[] }).passages;
    // Drop headings and verse numbers: only verse text identifies the ESV.
    for (const sh of shingles(passages.join(" ").replace(/<h\d[^>]*>[\s\S]*?<\/h\d>/g, " ").replace(/<b class="(verse|chapter)-num[^"]*"[^>]*>[\s\S]*?<\/b>/g, " "))) set.add(sh);
  }
  if (pdDataDir && existsSync(pdDataDir))
    for (const f of walk(pdDataDir)) if (f.endsWith(".json")) for (const sh of shingles(readFileSync(f, "utf8"))) set.delete(sh);
  return set;
}

/** Text-file paths under dist/, skipping data/ (public-domain data; its ESV rule is "no data/esv"). */
function* siteFiles(dist: string): Generator<string> {
  for (const f of walk(dist)) if (!relative(dist, f).startsWith("data") && TEXT.test(f.split("/").pop()!)) yield f;
}

export function checkEsvDist(dist: string, fingerprints: Set<string>, key?: string): string[] {
  const out: string[] = [];
  for (const f of siteFiles(dist)) {
    const text = readFileSync(f, "utf8");
    const rel = relative(dist, f);
    if (key && key.length >= 16 && text.includes(key)) out.push(`${rel}: ESV API key value`);
    if (/Token [0-9a-f]{40}\b/.test(text)) out.push(`${rel}: ESV-style API token`);
    for (const sh of shingles(text))
      if (fingerprints.has(sh)) {
        out.push(`${rel}: ESV text ("${sh}")`);
        break;
      }
  }
  if (existsSync(join(dist, "data"))) for (const f of walk(join(dist, "data"))) if (/(^|\/)esv(\/|\.|$)/.test(relative(dist, f))) out.push(`${relative(dist, f)}: ESV data file`);
  const sitemap = join(dist, "sitemap.xml");
  if (existsSync(sitemap) && /\/esv[/<]/.test(readFileSync(sitemap, "utf8"))) out.push("sitemap.xml: ESV URL");
  const shell = join(dist, "esv/index.html");
  if (existsSync(shell) && !/<meta name="robots" content="noindex"/.test(readFileSync(shell, "utf8"))) out.push("esv/index.html: shell is not noindex");
  return out;
}

/** Sources whose data shapes must never carry ESV text: SW cache config, IndexedDB schema, sync types. */
export const ESV_FREE_SOURCES = ["apps/web/src/sw.ts", "apps/web/src/highlights/store.ts", "apps/web/src/highlights/sync.ts", "apps/worker/src/highlights/api.ts", "packages/core/src/types.ts"];

export function checkEsvSources(root: string, fingerprints: Set<string>): string[] {
  const out: string[] = [];
  for (const p of ESV_FREE_SOURCES) {
    for (const sh of shingles(readFileSync(join(root, p), "utf8")))
      if (fingerprints.has(sh)) {
        out.push(`${p}: ESV text ("${sh}")`);
        break;
      }
  }
  return out;
}

/** CI self-test: a deliberately bad dist must fail every ESV check (P5.8 Verify). */
function selfTest(fingerprints: Set<string>): boolean {
  const d = mkdtempSync(join(tmpdir(), "bad-dist-"));
  const write = (p: string, c: string) => (mkdirSync(dirname(join(d, p)), { recursive: true }), writeFileSync(join(d, p), c));
  const sample = [...fingerprints][0]!;
  write("sw.js", `const PRECACHE = ["${sample}"];`);
  write("index.html", `<p>Token ${"ab12".repeat(10)}</p>`);
  write("sitemap.xml", "<urlset><url><loc>https://x/esv/john/3</loc></url></urlset>");
  write("esv/index.html", "<title>ESV</title>");
  write("data/esv/john/3.json", "{}");
  const problems = checkEsvDist(d, fingerprints, "fake-key-for-self-test");
  const want = ["ESV text", "ESV-style API token", "sitemap.xml: ESV URL", "not noindex", "ESV data file"];
  const missing = want.filter((w) => !problems.some((p) => p.includes(w)));
  if (missing.length) console.error(`compliance self-test: not detected: ${missing.join(", ")}`);
  return missing.length === 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const dist = join(root, "apps/web/dist");
  const fingerprints = esvFingerprints(join(root, "apps/worker/test/fixtures/esv"), join(dist, "data"));
  if (fingerprints.size < 1000) {
    console.error(`compliance: only ${fingerprints.size} ESV fingerprints; fixtures missing?`);
    process.exit(1);
  }
  if (process.argv.includes("--self-test")) {
    if (!selfTest(fingerprints)) process.exit(1);
    console.log("compliance self-test ok");
    process.exit(0);
  }
  const problems = [
    ...checkDist(dist),
    ...checkWorkerConfig(readFileSync(join(root, "apps/worker/wrangler.jsonc"), "utf8")),
    ...checkEsvDist(dist, fingerprints, process.env.ESV_API_KEY),
    ...checkEsvSources(root, fingerprints),
  ];
  if (problems.length) {
    console.error(`compliance: ${problems.length} problem(s)\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log("compliance ok");
}
