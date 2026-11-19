// D§3.12 Highlight sync, D§4.3 semantics: LWW upsert with a per-batch seq, pull by cursor, reset.
import { isVerseId } from "@tolle/core";
import { guard, json } from "../auth/auth.ts";
import { sessionFrom } from "../auth/session.ts";
import type { D1 } from "../db.ts";

export const MAX_BATCH = 200;
const COLORS = new Set(["sand", "sage", "slate", "rose"]);
const PAST_MS = 366 * 86_400_000;
const FUTURE_MS = 5 * 60_000;

interface Item {
  verseId: number;
  color: string | null;
  updatedAt: number;
}
interface Row {
  verse_id: number;
  color: string | null;
  updated_at: number;
  deleted: number;
  seq: number;
}

export function parseItems(body: unknown, now: number): Item[] | null {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length > MAX_BATCH) return null;
  const out: Item[] = [];
  for (const it of items as Record<string, unknown>[]) {
    const { verseId, color, updatedAt } = it ?? {};
    if (!isVerseId(verseId) || !(color === null || (typeof color === "string" && COLORS.has(color)))) return null;
    if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return null;
    out.push({ verseId, color, updatedAt: Math.round(Math.min(now + FUTURE_MS, Math.max(now - PAST_MS, updatedAt))) });
  }
  return out;
}

const changes = (r: unknown) => Number((r as { changes?: number; meta?: { changes?: number } })?.meta?.changes ?? (r as { changes?: number })?.changes ?? 0);

export async function handleSync(req: Request, db: D1, now: number): Promise<Response | null> {
  const url = new URL(req.url);
  const route = `${req.method} ${url.pathname}`;
  if (route !== "GET /api/v1/highlights" && route !== "POST /api/v1/highlights/batch") return null;
  if (req.method === "POST") {
    const bad = guard(req);
    if (bad) return bad;
  }
  const s = await sessionFrom(req, db, now);
  if (!s) return json({ error: "unauthorized" }, 401);
  const extra: Record<string, string> = s.refresh ? { "Set-Cookie": s.refresh } : {};
  const uid = s.userId;

  if (req.method === "POST") {
    const items = parseItems(await req.json().catch(() => null), now);
    if (!items) return json({ error: "invalid_items", max: MAX_BATCH }, 400);
    // One batch = one transaction, so seq and rows commit together (D§4.3); ties keep the existing row.
    const upsert = "INSERT INTO highlights (user_id, verse_id, color, updated_at, deleted, seq) VALUES (?1, ?2, ?3, ?4, ?5, (SELECT seq FROM users WHERE id = ?1)) ON CONFLICT (user_id, verse_id) DO UPDATE SET color = excluded.color, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq WHERE excluded.updated_at > highlights.updated_at";
    const res = items.length
      ? await db.batch([db.prepare("UPDATE users SET seq = seq + 1 WHERE id = ?1").bind(uid), ...items.map((i) => db.prepare(upsert).bind(uid, i.verseId, i.color, i.updatedAt, i.color === null ? 1 : 0))])
      : [];
    const applied = res.slice(1).reduce((n: number, r) => n + changes(r), 0);
    const u = await db.prepare("SELECT seq FROM users WHERE id = ?1").bind(uid).first<{ seq: number }>();
    return json({ applied, cursor: u?.seq ?? 0 }, 200, extra);
  }

  const raw = url.searchParams.get("since") ?? "0";
  const since = /^\d{1,15}$/.test(raw) ? Number(raw) : -1;
  if (since < 0) return json({ error: "invalid_cursor" }, 400);
  const u = await db.prepare("SELECT seq, purged_seq FROM users WHERE id = ?1").bind(uid).first<{ seq: number; purged_seq: number }>();
  if (!u) return json({ error: "unauthorized" }, 401);
  const reset = since > 0 && (since < u.purged_seq || since > u.seq);
  const rows = await db
    .prepare(reset ? "SELECT * FROM highlights WHERE user_id = ?1 AND deleted = 0 ORDER BY seq, verse_id" : "SELECT * FROM highlights WHERE user_id = ?1 AND seq > ?2 ORDER BY seq, verse_id")
    .bind(uid, ...(reset ? [] : [since]))
    .all<Row>();
  const items = rows.results.map((r) => ({ verseId: r.verse_id, color: r.deleted ? null : r.color, updatedAt: r.updated_at }));
  return json({ items, cursor: u.seq, reset }, 200, extra);
}
