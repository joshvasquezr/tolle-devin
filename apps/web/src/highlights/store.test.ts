// P4.1 Verify: D§3.10 Store; SPEC H3, H6 (no text fields). fake-indexeddb + localStorage fallback.
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { CHANNEL, LOCAL_KEY, onRemoteChange, openStore, type Store } from "./store.ts";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const backends: [string, () => Promise<Store>][] = [
  ["idb", () => openStore({ indexedDB: new IDBFactory() })],
  ["local", () => openStore({ localStorage: new MemStorage() as unknown as Storage })],
];

describe.each(backends)("store (%s)", (kind, make) => {
  it("uses the expected backend", async () => {
    expect((await make()).kind).toBe(kind);
  });
  it("writes highlights + outbox; chapter range read excludes deleted and other chapters", async () => {
    const s = await make();
    await s.apply([
      { verseId: 43003016, color: "sand", updatedAt: 1 },
      { verseId: 43003017, color: "sage", updatedAt: 1 },
      { verseId: 43004001, color: "rose", updatedAt: 1 },
    ]);
    await s.apply([{ verseId: 43003017, color: null, updatedAt: 2 }]);
    expect([...(await s.range(43003000, 43003999))]).toEqual([[43003016, "sand"]]);
    expect(await s.get(43003017)).toEqual({ color: null, updatedAt: 2, deleted: true });
    expect((await s.outbox()).get(43003017)).toEqual({ color: null, updatedAt: 2 });
    await s.clearOutbox([43003016, 43003017]);
    expect([...(await s.outbox()).keys()]).toEqual([43004001]);
    await s.setMeta("cursor", "abc");
    expect(await s.getMeta("cursor")).toBe("abc");
  });
  it("H6: stored values contain no string fields other than color", async () => {
    const s = await make();
    await s.apply([{ verseId: 1001001, color: "slate", updatedAt: 5 }, { verseId: 1001002, color: null, updatedAt: 6 }]);
    for (const rows of [await s.all(), await s.outbox()]) {
      for (const v of rows.values()) {
        for (const [k, val] of Object.entries(v)) if (typeof val === "string") expect(k).toBe("color");
        expect(Object.keys(v).every((k) => ["color", "updatedAt", "deleted"].includes(k))).toBe(true);
      }
    }
  });
});

describe("fallback and cross-tab", () => {
  it("falls back to localStorage when IndexedDB fails to open, and persists", async () => {
    const storage = new MemStorage() as unknown as Storage;
    const broken = { open: () => { throw new Error("blocked"); } } as unknown as IDBFactory;
    const s = await openStore({ indexedDB: broken, localStorage: storage });
    expect(s.kind).toBe("local");
    await s.apply([{ verseId: 19023001, color: "sand", updatedAt: 1 }]);
    expect(storage.getItem(LOCAL_KEY)).toContain("19023001");
    const again = await openStore({ localStorage: storage });
    expect([...(await again.range(19023000, 19023999))]).toEqual([[19023001, "sand"]]);
  });
  it("broadcasts changed ids on BroadcastChannel", async () => {
    const got = new Promise<number[]>((res) => {
      const off = onRemoteChange((ids) => { off(); res(ids); });
    });
    const s = await openStore({ indexedDB: new IDBFactory() });
    await s.apply([{ verseId: 40005044, color: "rose", updatedAt: 1 }]);
    expect(await got).toEqual([40005044]);
    expect(CHANNEL).toBe("quiet-highlights");
  });
});
