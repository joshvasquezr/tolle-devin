// P7.3 Verify: D§9 compliance checks fail on deliberately bad files and pass on clean ones.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDist, checkWorkerConfig } from "./compliance.ts";

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
