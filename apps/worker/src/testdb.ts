// Test helper: the D1 subset over node:sqlite with the real migrations applied (foreign keys on, as in D1).
/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { D1, D1Stmt } from "./db.ts";

export function testDb(): D1 & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f: string) => f.endsWith(".sql")).sort()) raw.exec(readFileSync(new URL(f, dir), "utf8"));
  const stmt = (sql: string, args: unknown[] = []): D1Stmt & { exec(): unknown } => {
    // D1 uses ?1-style params; node:sqlite accepts them as anonymous numbered parameters.
    const p = () => raw.prepare(sql);
    const a = args as never[];
    return {
      bind: (...v: unknown[]) => stmt(sql, v),
      first: async <T>() => ((p().get(...a) as T | undefined) ?? null),
      all: async <T>() => ({ results: p().all(...a) as T[] }),
      run: async () => p().run(...a),
      exec: () => p().run(...a),
    };
  };
  return {
    raw,
    prepare: (sql) => stmt(sql),
    async batch(stmts) {
      raw.exec("BEGIN");
      try {
        const out = stmts.map((s) => (s as unknown as { exec(): unknown }).exec());
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
