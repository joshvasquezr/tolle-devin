// P4.4 Verify: D§3.10 Apply step 4 — undo restores state; fresh timestamps; cap 50 (property test).
import { describe, expect, it } from "vitest";
import { createHistory, UNDO_CAP, type Op } from "./history.ts";
import { COLORS, openStore, type Color, type Store, type Write } from "./store.ts";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const fresh = () => openStore({ localStorage: new MemStorage() as unknown as Storage });

/** Same contract as paint.applyColor, without the DOM. */
async function apply(store: Store, ids: number[], color: Color | null, now: number): Promise<Op> {
  const prior: Write[] = [];
  for (const id of ids) {
    const r = await store.get(id);
    prior.push({ verseId: id, color: r && !r.deleted ? r.color : null, updatedAt: r?.updatedAt ?? 0 });
  }
  const next = ids.map((verseId) => ({ verseId, color, updatedAt: now }));
  await store.apply(next);
  return { prior, next };
}

const live = async (s: Store) => [...(await s.range(0, 1e9))].sort((a, b) => a[0] - b[0]);

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe("undo", () => {
  it("undo restores the previous color with a fresh, later timestamp", async () => {
    const s = await fresh();
    const h = createHistory();
    h.record(await apply(s, [1001001], "sand", 100));
    h.record(await apply(s, [1001001], "rose", 200));
    const w = await h.undo(s, 150);
    expect(w).toEqual([{ verseId: 1001001, color: "sand", updatedAt: 201 }]);
    expect(await live(s)).toEqual([[1001001, "sand"]]);
    await h.undo(s, 500);
    expect(await live(s)).toEqual([]);
    expect((await s.get(1001001))?.updatedAt).toBe(500);
    expect(await h.undo(s)).toBeNull();
  });

  it("property: any apply sequence undone k times equals the state after n−k ops", async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const s = await fresh();
      const h = createHistory();
      const snapshots = [await live(s)];
      const n = 1 + Math.floor(r() * 20);
      for (let i = 0; i < n; i++) {
        const start = 1001001 + Math.floor(r() * 6);
        const ids = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, j) => start + j);
        const c = r() < 0.25 ? null : COLORS[Math.floor(r() * 4)]!;
        h.record(await apply(s, ids, c, 1000 + i));
        snapshots.push(await live(s));
      }
      const k = Math.floor(r() * (n + 1));
      for (let i = 0; i < k; i++) await h.undo(s, 5000 + i);
      expect(await live(s), `seed ${seed}`).toEqual(snapshots[n - k]);
      for (const row of (await s.all()).values()) expect(row.updatedAt).toBeLessThan(6000);
    }
  });

  it("keeps only the last 50 operations", async () => {
    const s = await fresh();
    const h = createHistory();
    for (let i = 0; i < UNDO_CAP + 10; i++) h.record(await apply(s, [1001001 + i], "sage", i + 1));
    expect(h.size).toBe(UNDO_CAP);
    let n = 0;
    while (await h.undo(s, 10_000 + n)) n++;
    expect(n).toBe(UNDO_CAP);
    expect((await live(s)).map(([id]) => id)).toEqual(Array.from({ length: 10 }, (_, i) => 1001001 + i));
  });
});
