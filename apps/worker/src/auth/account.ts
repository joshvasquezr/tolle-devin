// SPEC A7, A8: me, sign-out, account export and delete (cascade).
import { deleteUser, getUser, type D1 } from "../db.ts";
import { guard, json } from "./auth.ts";
import { CLEAR_COOKIE, sessionFrom } from "./session.ts";

export async function handleAccount(req: Request, db: D1, now: number): Promise<Response | null> {
  const { pathname } = new URL(req.url);
  const route = `${req.method} ${pathname}`;
  if (!["POST /api/v1/auth/signout", "GET /api/v1/me", "DELETE /api/v1/account", "GET /api/v1/account/export"].includes(route)) return null;
  if (req.method !== "GET") {
    const bad = guard(req);
    if (bad) return bad;
  }
  const s = await sessionFrom(req, db, now);
  if (!s) return json({ error: "unauthorized" }, 401);
  const extra: Record<string, string> = s.refresh ? { "Set-Cookie": s.refresh } : {};
  switch (route) {
    case "POST /api/v1/auth/signout":
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(s.hash).run();
      return new Response(null, { status: 204, headers: { "Set-Cookie": CLEAR_COOKIE, "Cache-Control": "no-store" } });
    case "GET /api/v1/me": {
      const u = await getUser(db, s.userId);
      return u ? json({ id: u.id, email: u.email }, 200, extra) : json({ error: "unauthorized" }, 401);
    }
    case "DELETE /api/v1/account":
      await deleteUser(db, s.userId);
      return new Response(null, { status: 204, headers: { "Set-Cookie": CLEAR_COOKIE, "Cache-Control": "no-store" } });
    default: {
      const u = await getUser(db, s.userId);
      const rows = await db.prepare("SELECT verse_id, color, updated_at FROM highlights WHERE user_id = ?1 AND deleted = 0 ORDER BY verse_id").bind(s.userId).all<{ verse_id: number; color: string; updated_at: number }>();
      return json(
        { version: 1, user: { id: u?.id, email: u?.email, createdAt: u?.created_at }, items: rows.results.map((r) => ({ verseId: r.verse_id, color: r.color, updatedAt: r.updated_at })) },
        200,
        { ...extra, "Content-Disposition": 'attachment; filename="quiet-account.json"' },
      );
    }
  }
}
