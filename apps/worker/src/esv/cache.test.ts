// P5.4 · D§3.12 Cache with Crossway's 500-verse total (docs/esv-compliance.md).
import { describe, expect, it } from "vitest";
import { CACHE_TTL_MS, MAX_CACHED_VERSES, VerseCappedCache } from "./cache.ts";

const B = [{ t: "p" as const, items: ["x"] }];

describe("VerseCappedCache", () => {
  it("never holds more than 500 verses in total; evicts least recently used", () => {
    const c = new VerseCappedCache();
    for (let i = 0; i < 20; i++) expect(c.put(`k${i}`, B, 36, 0)).toBe(true);
    expect(c.size).toBeLessThanOrEqual(MAX_CACHED_VERSES);
    expect(c.get("k0", 1)).toBeUndefined();
    expect(c.get("k19", 1)).toEqual(B);
  });
  it("a hit refreshes recency", () => {
    const c = new VerseCappedCache();
    c.put("a", B, 250, 0);
    c.put("b", B, 250, 0);
    c.get("a", 1);
    c.put("c", B, 100, 2);
    expect(c.get("a", 3)).toEqual(B);
    expect(c.get("b", 3)).toBeUndefined();
    expect(c.size).toBe(350);
  });
  it("entries expire at 24 h", () => {
    const c = new VerseCappedCache();
    c.put("a", B, 10, 0);
    expect(c.get("a", CACHE_TTL_MS - 1)).toEqual(B);
    expect(c.get("a", CACHE_TTL_MS)).toBeUndefined();
    expect(c.size).toBe(0);
  });
  it("rejects windows over 500 or invalid counts; replacing a key does not double count", () => {
    const c = new VerseCappedCache();
    expect(c.put("big", B, 501, 0)).toBe(false);
    expect(c.put("zero", B, 0, 0)).toBe(false);
    c.put("a", B, 40, 0);
    c.put("a", B, 40, 1);
    expect(c.size).toBe(40);
  });
});
