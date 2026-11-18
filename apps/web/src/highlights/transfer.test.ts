// P4.7 Verify: SPEC H8 — export/import round-trip; LWW merge with counts; untrusted input filtered (H6).
import { describe, expect, it } from "vitest";
import { openStore } from "./store.ts";
import { exportFile, mergeImport, parseImport } from "./transfer.ts";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const fresh = () => openStore({ localStorage: new MemStorage() as unknown as Storage });

describe("export / import", () => {
  it("round-trips (deleted rows not exported)", async () => {
    const a = await fresh();
    await a.apply([
      { verseId: 43003016, color: "sand", updatedAt: 10 },
      { verseId: 19023001, color: "sage", updatedAt: 11 },
      { verseId: 1001001, color: null, updatedAt: 12 },
    ]);
    const file = await exportFile(a);
    expect(file).toEqual({ version: 1, items: [{ verseId: 19023001, color: "sage", updatedAt: 11 }, { verseId: 43003016, color: "sand", updatedAt: 10 }] });
    const b = await fresh();
    expect(await mergeImport(b, parseImport(JSON.stringify(file)))).toEqual({ applied: 2, skipped: 0 });
    expect(await exportFile(b)).toEqual(file);
  });
  it("merges last-write-wins and reports counts", async () => {
    const s = await fresh();
    await s.apply([
      { verseId: 43003016, color: "sand", updatedAt: 100 },
      { verseId: 43003017, color: null, updatedAt: 100 },
    ]);
    const r = await mergeImport(s, [
      { verseId: 43003016, color: "rose", updatedAt: 50 }, // older: loses
      { verseId: 43003017, color: "slate", updatedAt: 200 }, // newer than the tombstone: wins
      { verseId: 43003018, color: "sage", updatedAt: 1 }, // new
    ]);
    expect(r).toEqual({ applied: 2, skipped: 1 });
    expect([...(await s.range(43003000, 43003999))]).toEqual([[43003016, "sand"], [43003017, "slate"], [43003018, "sage"]]);
  });
  it("rejects wrong files and drops invalid items and extra fields", () => {
    expect(() => parseImport("{}")).toThrow();
    expect(() => parseImport('{"version":2,"items":[]}')).toThrow();
    const items = parseImport(JSON.stringify({ version: 1, items: [
      { verseId: 43003016, color: "sand", updatedAt: 1, text: "For God so loved" },
      { verseId: 99999999, color: "sand", updatedAt: 1 },
      { verseId: 43003016, color: "red", updatedAt: 1 },
      { verseId: 43003016, color: "sage", updatedAt: -1 },
      null,
    ] }));
    expect(items).toEqual([{ verseId: 43003016, color: "sand", updatedAt: 1 }]);
  });
});
