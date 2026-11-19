// P6.7 Verify: SPEC A3–A6, D§4.3 — two simulated clients converge (fast-check), first-sign-in merge,
// outbox kept on failure, reset handling.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { openStore, type Color, type Store } from "./store.ts";
import { syncOnce } from "./sync.ts";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
}
const newStore = () => openStore({ localStorage: memStorage() });

/** In-memory server with the D§4.3 rules: per-batch seq, strict LWW, tombstones, cursor pull. */
function server() {
  const rows = new Map<number, { color: Color | null; updatedAt: number; seq: number }>();
  let seq = 0;
  let down = false;
  const fetcher = async (url: string, init?: RequestInit) => {
    if (down) return new Response("", { status: 503 });
    if (url === "/api/v1/highlights/batch") {
      const { items } = JSON.parse(String(init!.body)) as { items: { verseId: number; color: Color | null; updatedAt: number }[] };
      seq++;
      let applied = 0;
      for (const it of items) {
        const cur = rows.get(it.verseId);
        if (!cur || it.updatedAt > cur.updatedAt) {
          rows.set(it.verseId, { color: it.color, updatedAt: it.updatedAt, seq });
          applied++;
        }
      }
      return Response.json({ applied, cursor: seq });
    }
    const since = Number(new URL(url, "https://x").searchParams.get("since"));
    const items = [...rows].filter(([, r]) => r.seq > since).map(([verseId, r]) => ({ verseId, color: r.color, updatedAt: r.updatedAt }));
    return Response.json({ items, cursor: seq, reset: false });
  };
  return { rows, fetcher, setDown: (d: boolean) => void (down = d) };
}

const live = async (s: Store) => new Map([...(await s.all())].filter(([, r]) => !r.deleted).map(([k, r]) => [k, r.color]));

describe("sync engine", () => {
  it("two clients converge to per-verse LWW after any interleaving (A4, A5)", async () => {
    const verses = [43_003_016, 43_003_017, 19_023_001];
    const op = fc.oneof(
      fc.record({ k: fc.constant("write" as const), c: fc.integer({ min: 0, max: 1 }), v: fc.constantFrom(...verses), color: fc.constantFrom<Color | null>("sand", "sage", "slate", "rose", null) }),
      fc.record({ k: fc.constant("sync" as const), c: fc.integer({ min: 0, max: 1 }) }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(op, { maxLength: 30 }), async (ops) => {
        const srv = server();
        const clients = [await newStore(), await newStore()];
        const newest = new Map<number, Color | null>();
        let clock = 1_000;
        for (const o of ops) {
          if (o.k === "write") {
            clock++;
            await clients[o.c]!.apply([{ verseId: o.v, color: o.color, updatedAt: clock }]);
            newest.set(o.v, o.color);
          } else await syncOnce(clients[o.c]!, srv.fetcher);
        }
        for (let round = 0; round < 2; round++) for (const c of clients) await syncOnce(c, srv.fetcher);
        const expected = new Map([...newest].filter(([, c]) => c !== null));
        expect(await live(clients[0]!)).toEqual(expected);
        expect(await live(clients[1]!)).toEqual(expected);
        expect((await clients[0]!.outbox()).size + (await clients[1]!.outbox()).size).toBe(0);
      }),
      { numRuns: 150 },
    );
  });

  it("first sign-in merges local rows up and server rows down (A3)", async () => {
    const srv = server();
    srv.rows.set(1_001_001, { color: "rose", updatedAt: 50, seq: 1 });
    srv.rows.set(43_003_016, { color: "sage", updatedAt: 10, seq: 1 });
    const s = await newStore();
    await s.apply([{ verseId: 43_003_016, color: "sand", updatedAt: 20 }]);
    await s.clearOutbox([43_003_016]); // a pre-account row that is no longer queued still goes up
    const changed = await syncOnce(s, srv.fetcher);
    expect(changed).toEqual([1_001_001]);
    expect(await live(s)).toEqual(new Map([[43_003_016, "sand"], [1_001_001, "rose"]]));
    expect(srv.rows.get(43_003_016)!.color).toBe("sand");
    expect(await s.getMeta("synced")).toBe(true);
  });

  it("keeps the outbox when offline and drains it later (A6); pulled rows don't re-enter the outbox", async () => {
    const srv = server();
    const s = await newStore();
    await s.apply([{ verseId: 43_003_016, color: "sand", updatedAt: 5 }]);
    srv.setDown(true);
    await expect(syncOnce(s, srv.fetcher)).rejects.toThrow();
    expect((await s.outbox()).size).toBe(1);
    srv.setDown(false);
    await syncOnce(s, srv.fetcher);
    expect((await s.outbox()).size).toBe(0);
    srv.rows.set(43_003_017, { color: "slate", updatedAt: 9, seq: 99 });
    await syncOnce(s, srv.fetcher);
    expect((await s.outbox()).size).toBe(0);
    expect((await s.get(43_003_017))?.color).toBe("slate");
  });

  it("reset: rows missing from the full set are removed locally unless still queued", async () => {
    const s = await newStore();
    await s.applyRemote([{ verseId: 1, color: "sand", updatedAt: 1 }, { verseId: 2, color: "sage", updatedAt: 1 }]);
    await s.setMeta("synced", true);
    await s.setMeta("cursor", 7);
    const fetcher = async (url: string) =>
      url.includes("batch") ? Response.json({ applied: 0, cursor: 9 }) : Response.json({ items: [{ verseId: 2, color: "sage", updatedAt: 1 }], cursor: 9, reset: true });
    expect(await syncOnce(s, fetcher)).toEqual([1]);
    expect(await live(s)).toEqual(new Map([[2, "sage"]]));
    expect(await s.getMeta("cursor")).toBe(9);
  });
});
