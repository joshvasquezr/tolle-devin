// SPEC §8.2 About page data; P1.7.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseSources } from "./sources.ts";

const md = readFileSync(new URL("../../../../data/sources/SOURCES.md", import.meta.url), "utf8");

it("reads one row per PD translation from SOURCES.md with URL, checksum and status", () => {
  const rows = parseSources(md);
  expect(rows.map((r) => r.tr)).toEqual(["bsb", "kjv", "web"]);
  for (const r of rows) {
    expect(r.url).toMatch(/^https:\/\/\S+\.zip$/);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.status.length).toBeGreaterThan(20);
    expect(r.status).not.toMatch(/\*\*|`/);
  }
  expect(rows[0]!.status).toContain("public domain");
});
