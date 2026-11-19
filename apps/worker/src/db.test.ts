// P6.1 Verify: D§4.2 schema applies cleanly; cascade delete; purge cron; constraints.
import { describe, expect, it } from "vitest";
import { deleteUser, getUser, getUserByEmail, purge } from "./db.ts";
import { testDb } from "./testdb.ts";

describe("D1 schema", () => {
  it("applies; deleting a user cascades to sessions and highlights", async () => {
    const db = testDb();
    await db.batch([
      db.prepare("INSERT INTO users (id, email, created_at) VALUES (?1, ?2, ?3)").bind("u1", "a@example.com", 1),
      db.prepare("INSERT INTO sessions VALUES (?1, ?2, 'web', 1, 9999999999)").bind("h1", "u1"),
      db.prepare("INSERT INTO highlights VALUES (?1, 43003016, 'sand', 5, 0, 1)").bind("u1"),
      db.prepare("INSERT INTO login_tokens VALUES ('t', 'a@example.com', 9999999999, NULL)"),
    ]);
    expect((await getUserByEmail(db, "a@example.com"))?.id).toBe("u1");
    await deleteUser(db, "u1");
    expect(await getUser(db, "u1")).toBeNull();
    for (const t of ["sessions", "highlights"]) expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())?.n).toBe(0);
  });
  it("enforces constraints (session kind, unique email, FK)", async () => {
    const db = testDb();
    await db.prepare("INSERT INTO users (id, email, created_at) VALUES ('u', 'x@y.z', 1)").run();
    await expect(db.prepare("INSERT INTO users (id, email, created_at) VALUES ('v', 'x@y.z', 1)").run()).rejects.toThrow();
    await expect(db.prepare("INSERT INTO sessions VALUES ('h', 'u', 'bot', 1, 2)").run()).rejects.toThrow();
    await expect(db.prepare("INSERT INTO highlights VALUES ('nobody', 1001001, 'sand', 1, 0, 1)").run()).rejects.toThrow();
  });
  it("purge removes expired tokens/sessions and 30-day-old tombstones only", async () => {
    const db = testDb();
    const now = 100 * 86_400_000;
    const s = now / 1000;
    await db.batch([
      db.prepare("INSERT INTO users (id, email, created_at) VALUES ('u', 'x@y.z', 1)"),
      db.prepare("INSERT INTO login_tokens VALUES ('old', 'x@y.z', ?1, NULL), ('new', 'x@y.z', ?2, NULL)").bind(s - 1, s + 900),
      db.prepare("INSERT INTO sessions VALUES ('old', 'u', 'web', 1, ?1), ('new', 'u', 'web', 1, ?2)").bind(s - 1, s + 99),
      db.prepare("INSERT INTO highlights VALUES ('u', 1, NULL, ?1, 1, 1), ('u', 2, NULL, ?2, 1, 1), ('u', 3, 'sand', 1, 0, 1)").bind(now - 31 * 86_400_000, now - 86_400_000),
    ]);
    await purge(db, now);
    const ids = async (sql: string) => (await db.prepare(sql).all<{ k: string | number }>()).results.map((r) => r.k);
    expect(await ids("SELECT token_hash AS k FROM login_tokens")).toEqual(["new"]);
    expect(await ids("SELECT token_hash AS k FROM sessions")).toEqual(["new"]);
    expect(await ids("SELECT verse_id AS k FROM highlights ORDER BY verse_id")).toEqual([2, 3]);
  });
});
