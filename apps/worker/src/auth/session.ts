// D§3.12 sessions (SPEC A2): cookie (web) or Bearer (native); 90 days, extended when < 30 days remain.
import type { D1 } from "../db.ts";
import { COOKIE, SESSION_S } from "./auth.ts";
import { sha256Hex } from "./crypto.ts";

export interface Session {
  userId: string;
  hash: string;
  kind: "web" | "native";
  /** Set-Cookie to send when a web session was extended. */
  refresh?: string;
}

export function tokenFrom(req: Request): string | null {
  const bearer = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get("Authorization") ?? "");
  if (bearer) return bearer[1]!;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})`).exec(req.headers.get("Cookie") ?? "");
  return m?.[1] ?? null;
}

export async function sessionFrom(req: Request, db: D1, now: number): Promise<Session | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  const s = Math.floor(now / 1000);
  const hash = await sha256Hex(token);
  const row = await db.prepare("SELECT user_id, kind, expires_at FROM sessions WHERE token_hash = ?1 AND expires_at > ?2").bind(hash, s).first<{ user_id: string; kind: "web" | "native"; expires_at: number }>();
  if (!row) return null;
  const out: Session = { userId: row.user_id, hash, kind: row.kind };
  if (row.expires_at - s < 30 * 86_400) {
    await db.prepare("UPDATE sessions SET expires_at = ?2 WHERE token_hash = ?1").bind(hash, s + SESSION_S).run();
    if (row.kind === "web") out.refresh = `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_S}`;
  }
  return out;
}

export const CLEAR_COOKIE = `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
