// D§3.12 Auth, D§1 D4 (SPEC A2): magic-link request (always 202) and POST verify (single use).
import type { D1 } from "../db.ts";
import { randomHex, sha256Hex } from "./crypto.ts";
import { Limiter } from "./ratelimit.ts";
import type { Mailer } from "./mail.ts";

export const TOKEN_TTL_S = 15 * 60;
export const SESSION_S = 90 * 86_400;
export const COOKIE = "__Host-session";

export interface AuthEnv {
  DB: D1;
  mailer: Mailer;
  limits: { email: Limiter; ip: Limiter };
}

export const newLimits = () => ({ email: new Limiter(5, 3_600_000), ip: new Limiter(20, 3_600_000) });

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

/** CSRF (D§3.12): state-changing requests need JSON and, when present, a same-site Origin. */
export function guard(req: Request): Response | null {
  if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "unsupported_media_type" }, 415);
  const origin = req.headers.get("Origin");
  if (origin !== null && origin !== new URL(req.url).origin) return json({ error: "bad_origin" }, 403);
  return null;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export async function requestLink(req: Request, env: AuthEnv, now: number): Promise<Response> {
  const bad = guard(req);
  if (bad) return bad;
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const ipKey = await sha256Hex(req.headers.get("CF-Connecting-IP") ?? "unknown");
  // Every outcome below answers the same 202, so responses reveal nothing about accounts.
  if (EMAIL.test(email) && env.limits.ip.allow(ipKey, now) && env.limits.email.allow(email, now)) {
    const token = randomHex(32);
    await env.DB.prepare("INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?1, ?2, ?3)")
      .bind(await sha256Hex(token), email, Math.floor(now / 1000) + TOKEN_TTL_S)
      .run();
    const link = `${new URL(req.url).origin}/auth/verify#token=${token}`;
    await env.mailer.send({ to: email, subject: "Sign in to Quiet Bible", text: `Open this link to sign in (valid for 15 minutes):\n\n${link}\n\nIf you did not ask for this, ignore this email.` });
  }
  return json({}, 202);
}

export async function verifyLink(req: Request, env: AuthEnv, now: number): Promise<Response> {
  const bad = guard(req);
  if (bad) return bad;
  const body = (await req.json().catch(() => null)) as { token?: unknown; client?: unknown } | null;
  const token = typeof body?.token === "string" && /^[0-9a-f]{64}$/.test(body.token) ? body.token : null;
  const client = body?.client === "native" ? "native" : "web";
  if (!token) return json({ error: "invalid_token" }, 400);
  const s = Math.floor(now / 1000);
  const hash = await sha256Hex(token);
  // Single use: only one request can flip used_at.
  const row = await env.DB.prepare("UPDATE login_tokens SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND expires_at >= ?2 RETURNING email")
    .bind(hash, s)
    .first<{ email: string }>();
  if (!row) return json({ error: "invalid_token" }, 400);
  let user = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(row.email).first<{ id: string }>();
  if (!user) {
    user = { id: randomHex(16) };
    await env.DB.prepare("INSERT INTO users (id, email, created_at) VALUES (?1, ?2, ?3)").bind(user.id, row.email, s).run();
  }
  const session = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, kind, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(await sha256Hex(session), user.id, client, s, s + SESSION_S)
    .run();
  if (client === "native") return json({ user: { id: user.id }, token: session });
  return json({ user: { id: user.id } }, 200, { "Set-Cookie": `${COOKIE}=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_S}` });
}
