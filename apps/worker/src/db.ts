// D§4.2 data access. Structural D1 subset so tests can run on node:sqlite; bound parameters only.
export interface D1Result<T> {
  results: T[];
}
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1 {
  prepare(sql: string): D1Stmt;
  /** One transaction (D§4.3 upsert relies on this). */
  batch(stmts: D1Stmt[]): Promise<unknown[]>;
}

export interface UserRow {
  id: string;
  email: string;
  created_at: number;
  seq: number;
}

export const getUserByEmail = (db: D1, email: string) => db.prepare("SELECT * FROM users WHERE email = ?1").bind(email).first<UserRow>();
export const getUser = (db: D1, id: string) => db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>();
/** Cascades to sessions and highlights (SPEC A8). */
export const deleteUser = (db: D1, id: string) => db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();

/** Daily cron (D§4.2): expired tokens and sessions, tombstones older than 30 days. */
export function purge(db: D1, nowMs: number): Promise<unknown[]> {
  const s = Math.floor(nowMs / 1000);
  return db.batch([
    db.prepare("DELETE FROM login_tokens WHERE expires_at < ?1").bind(s),
    db.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(s),
    db.prepare("DELETE FROM highlights WHERE deleted = 1 AND updated_at < ?1").bind(nowMs - 30 * 86_400_000),
  ]);
}
