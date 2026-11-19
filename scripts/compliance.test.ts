// P7.3 Verify: D§9 compliance checks fail on deliberately bad files and pass on clean ones.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDist, checkEsvDist, checkEsvSources, checkWorkerConfig, esvFingerprints } from "./compliance.ts";

function dist(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "dist-"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(d, p, ".."), { recursive: true });
    writeFileSync(join(d, p), c);
  }
  return d;
}

describe("compliance checks", () => {
  it("clean site passes; Scripture data is not scanned", () => {
    expect(checkDist(dist({ "index.html": '<script type="module" src="/_astro/a.js"></script><a href="https://ebible.org">source</a>', "data/kjv/x.json": '"a donation"', "bsb/neh/10/index.html": "<p>a donation for the house</p>" }))).toEqual([]);
  });
  it.each([
    ["ad", '<script async src="https://pagead2.googlesyndication.com/x.js"></script>'],
    ["donation", '<a href="https://ko-fi.com/me">Support</a>'],
    ["donate link", '<a href="/donate">Give</a>'],
    ["donate button", "<button> Donate </button>"],
    ["tracker", "gtag('config','G-1')"],
    ["protocol-relative script", '<script src="//cdn.example.com/x.js"></script>'],
    ["remote stylesheet", '<link rel="stylesheet" href="https://fonts.googleapis.com/css">'],
    ["remote import", 'import("https://esm.sh/x")'],
  ])("fails on %s", (_n, bad) => {
    expect(checkDist(dist({ "a/page.html": bad })).length).toBeGreaterThan(0);
  });
  it("flags DEV_MAIL in the deploy config", () => {
    expect(checkWorkerConfig('{"vars":{"DEV_MAIL":"1"}}')).toHaveLength(1);
    expect(checkWorkerConfig('{"name":"tolle"}')).toEqual([]);
  });
});

// P5.8 Verify: D§9 ESV compliance checks fail on deliberately bad files and pass on clean ones.
describe("ESV compliance checks", () => {
  const root = join(import.meta.dirname, "..");
  const fp = esvFingerprints(join(root, "apps/worker/test/fixtures/esv"));
  const sample = [...fp][0]!;
  const shell = { "esv/index.html": '<meta name="robots" content="noindex"><h1>English Standard Version</h1>' };
  it("fingerprints come from the P5.1 fixtures", () => {
    expect(fp.size).toBeGreaterThan(1000);
  });
  it("clean site passes (citation and shell are not ESV text)", () => {
    const d = dist({ ...shell, "index.html": "<p>Scripture quotations are from the ESV® Bible</p>", "sitemap.xml": "<loc>https://x/bsb/john/3</loc>", "data/bsb/john/3.json": "{}" });
    expect(checkEsvDist(d, fp, "fake-esv-key-value-123")).toEqual([]);
  });
  it.each([
    ["ESV text in the SW", { "sw.js": `const c = "${sample}";` }, "ESV text"],
    ["ESV text in a page", { "x/index.html": `<p>${sample.toUpperCase()}</p>` }, "ESV text"],
    ["key value", { "_astro/a.js": 'const k="fake-esv-key-value-123"' }, "ESV API key value"],
    ["token header", { "a.js": `"Token ${"0f".repeat(20)}"` }, "ESV-style API token"],
    ["ESV data", { "data/esv/john/3.json": "{}" }, "ESV data file"],
    ["ESV sitemap URL", { "sitemap.xml": "<loc>https://x/esv/john/3</loc>" }, "sitemap.xml: ESV URL"],
    ["indexable shell", { "esv/index.html": "<h1>ESV</h1>" }, "not noindex"],
  ])("fails on %s", (_n, files, want) => {
    const problems = checkEsvDist(dist({ ...shell, ...files }), fp, "fake-esv-key-value-123");
    expect(problems.some((p) => p.includes(want)), problems.join("\n")).toBe(true);
  });
  it("public-domain wording shared with the ESV is excluded", () => {
    const words = sample.split(" ");
    const d = dist({ "data/kjv/x/1.json": JSON.stringify({ blocks: [{ t: "p", items: [words.join(" ")] }] }) });
    expect(esvFingerprints(join(root, "apps/worker/test/fixtures/esv"), join(d, "data")).has(sample)).toBe(false);
  });
  it("SW, IndexedDB schema and sync types hold no ESV text", () => {
    expect(checkEsvSources(root, fp)).toEqual([]);
  });
});

