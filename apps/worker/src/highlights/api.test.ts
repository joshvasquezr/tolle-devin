// P6.4 Verify (D§9 Sync): LWW, tombstones, reset, clamping, batch bounds, verse-id validation,
// concurrent batches, no-store, purge cron.
import { describe, expect, it } from "vitest";
import { purge } from "../db.ts";
import { testDb } from "../testdb.ts";
import { sha256Hex } from "../auth/crypto.ts";
import { handleSync, MAX_BATCH } from "./api.ts";

const O = "https://quiet.test";
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const TOK = "a".repeat(64);
const J316 = 43_003_016;
const J317 = 43_003_017;

async function setup() {
  const db = testDb();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, created_at) VALUES ('u', 'a@b.co', 1)"),
    db.prepare("INSERT INTO sessions VALUES (?1, 'u', 'native', 1, 9999999999)").bind(await sha256Hex(TOK)),
  ]);
  const push = async (items: unknown[], now = NOW) =>
    handleSync(new Request(`${O}/api/v1/highlights/batch`, { method: "POST", body: JSON.stringify({ items }), headers: { "Content-Type": "application/json", Origin: O, Authorization: `Bearer ${TOK}` } }), db, now) as Promise<Response>;
  const pull = async (since: number | string, now = NOW) => {
    const r = (await handleSync(new Request(`${O}/api/v1/highlights?since=${since}`, { headers: { Authorization: `Bearer ${TOK}` } }), db, now))!;
    return { status: r.status, cc: r.headers.get("Cache-Control"), body: (await r.json()) as { items: { verseId: number; color: string | null; updatedAt: number }[]; cursor: number; reset: boolean } };
  };
  return { db, push, pull };
}

describe("sync API", () => {
  it("LWW upsert with per-batch seq; ties keep existing; tombstones pulled; no-store", async () => {
    const { push, pull } = await setup();
    const a = await push([{ verseId: J316, color: "sand", updatedAt: NOW - 10 }, { verseId: J317, color: "sage", updatedAt: NOW - 10 }]);
    expect(a.headers.get("Cache-Control")).toBe("no-store");
    expect(await a.json()).toEqual({ applied: 2, cursor: 1 });
    expect(await (await push([{ verseId: J316, color: "rose", updatedAt: NOW - 20 }, { verseId: J317, color: "rose", updatedAt: NOW - 10 }])).json()).toEqual({ applied: 0, cursor: 2 });
    expect(await (await push([{ verseId: J316, color: null, updatedAt: NOW - 5 }])).json()).toEqual({ applied: 1, cursor: 3 });
    const p = await pull(1);
    expect(p.cc).toBe("no-store");
    expect(p.body).toEqual({ items: [{ verseId: J316, color: null, updatedAt: NOW - 5 }], cursor: 3, reset: false });
    expect((await pull(0)).body.items).toHaveLength(2);
    expect((await pull(3)).body.items).toEqual([]);
  });

  it("clamps updatedAt to [now − 366 d, now + 5 min]", async () => {
    const { push, pull } = await setup();
    await push([{ verseId: J316, color: "sand", updatedAt: NOW + DAY }, { verseId: J317, color: "sand", updatedAt: 0 }]);
    const items = (await pull(0)).body.items;
    expect(items.find((i) => i.verseId === J316)!.updatedAt).toBe(NOW + 300_000);
    expect(items.find((i) => i.verseId === J317)!.updatedAt).toBe(NOW - 366 * DAY);
  });

  it("rejects bad batches: > 200 items, invalid verse id or color, bad cursor; 401 without session", async () => {
    const { db, push, pull } = await setup();
    const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ verseId: 1_001_001 + (i % 31), color: "sand", updatedAt: NOW }));
    expect((await push(many)).status).toBe(400);
    expect((await push(many.slice(0, MAX_BATCH))).status).toBe(200);
    expect((await push([{ verseId: 43_003_099, color: "sand", updatedAt: NOW }])).status).toBe(400);
    expect((await push([{ verseId: J316, color: "red", updatedAt: NOW }])).status).toBe(400);
    expect((await push([{ verseId: J316, color: "sand", updatedAt: "x" }])).status).toBe(400);
    expect((await pull("abc")).status).toBe(400);
    expect((await handleSync(new Request(`${O}/api/v1/highlights`), db, NOW))!.status).toBe(401);
  });

  it("concurrent batches serialize: distinct seqs, newest value wins", async () => {
    const { push, pull } = await setup();
    const rs = await Promise.all([1, 2, 3, 4, 5].map((n) => push([{ verseId: J316, color: n % 2 ? "sand" : "sage", updatedAt: NOW - 100 + n }])));
    const cursors = await Promise.all(rs.map(async (r) => ((await r.json()) as { cursor: number }).cursor));
    expect(new Set(cursors).size).toBe(5);
    expect((await pull(0)).body.items).toEqual([{ verseId: J316, color: "sand", updatedAt: NOW - 95 }]);
  });

  it("purge cron removes old tombstones and later pulls from older cursors reset", async () => {
    const { db, push, pull } = await setup();
    await push([{ verseId: J316, color: "sand", updatedAt: NOW - 40 * DAY }], NOW - 40 * DAY);
    await push([{ verseId: J316, color: null, updatedAt: NOW - 35 * DAY }], NOW - 35 * DAY); // seq 2 tombstone
    await push([{ verseId: J317, color: "rose", updatedAt: NOW - DAY }], NOW - DAY); // seq 3
    await purge(db, NOW);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM highlights WHERE deleted = 1").first<{ n: number }>())!.n).toBe(0);
    const stale = await pull(1);
    expect(stale.body.reset).toBe(true);
    expect(stale.body.items).toEqual([{ verseId: J317, color: "rose", updatedAt: NOW - DAY }]);
    expect((await pull(2)).body.reset).toBe(false);
    expect((await pull(99)).body.reset).toBe(true); // cursor from another account / deleted account
  });
});
