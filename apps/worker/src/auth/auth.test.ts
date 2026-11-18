// P6.2 Verify (D§9): enumeration safety, expiry, replay, cookie flags, CSRF, native bearer, rate limits.
import { describe, expect, it } from "vitest";
import { testDb } from "../testdb.ts";
import { newLimits, requestLink, verifyLink, type AuthEnv } from "./auth.ts";
import { sha256Hex } from "./crypto.ts";

const ORIGIN = "https://quiet.test";
function setup() {
  const sent: { to: string; text: string }[] = [];
  const env: AuthEnv = { DB: testDb(), mailer: { send: async (m) => void sent.push(m) }, limits: newLimits() };
  return { env, sent };
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers } });
const tokenOf = (text: string) => /#token=([0-9a-f]{64})/.exec(text)![1]!;

describe("magic link", () => {
  it("request is always 202 with the same body; stores only the token hash, 15-min expiry", async () => {
    const { env, sent } = setup();
    const now = 1_700_000_000_000;
    const a = await requestLink(post("/api/v1/auth/request", { email: "  Reader@Example.com " }), env, now);
    const b = await requestLink(post("/api/v1/auth/request", { email: "not-an-email" }), env, now);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect([await a.text(), await b.text()]).toEqual(["{}", "{}"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("reader@example.com");
    const token = tokenOf(sent[0]!.text);
    expect(sent[0]!.text).toContain(`${ORIGIN}/auth/verify#token=`);
    const row = await env.DB.prepare("SELECT * FROM login_tokens").first<{ token_hash: string; expires_at: number }>();
    expect(row!.token_hash).toBe(await sha256Hex(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row!.expires_at).toBe(now / 1000 + 900);
  });

  it("verify: web cookie flags, creates the user once; replay and expiry rejected", async () => {
    const { env, sent } = setup();
    const now = 1_700_000_000_000;
    await requestLink(post("/api/v1/auth/request", { email: "a@b.co" }), env, now);
    const token = tokenOf(sent[0]!.text);
    const r = await verifyLink(post("/api/v1/auth/verify", { token, client: "web" }), env, now + 1000);
    expect(r.status).toBe(200);
    const cookie = r.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^__Host-session=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7776000$/);
    const { user } = (await r.json()) as { user: { id: string } };
    expect(user.id).toMatch(/^[0-9a-f]{32}$/);
    expect((await verifyLink(post("/api/v1/auth/verify", { token }), env, now + 2000)).status).toBe(400); // replay
    await requestLink(post("/api/v1/auth/request", { email: "a@b.co" }), env, now);
    const late = await verifyLink(post("/api/v1/auth/verify", { token: tokenOf(sent[1]!.text) }), env, now + 901_000);
    expect(late.status).toBe(400); // expired
    await requestLink(post("/api/v1/auth/request", { email: "a@b.co" }), env, now);
    const again = (await (await verifyLink(post("/api/v1/auth/verify", { token: tokenOf(sent[2]!.text) }), env, now + 5000)).json()) as { user: { id: string } };
    expect(again.user.id).toBe(user.id);
    const sess = await env.DB.prepare("SELECT kind, expires_at - created_at AS life FROM sessions").all<{ kind: string; life: number }>();
    expect(sess.results).toEqual([{ kind: "web", life: 7_776_000 }, { kind: "web", life: 7_776_000 }]);
  });

  it("native client gets a bearer token in the body and no cookie", async () => {
    const { env, sent } = setup();
    await requestLink(post("/api/v1/auth/request", { email: "n@b.co" }), env, 0);
    const r = await verifyLink(post("/api/v1/auth/verify", { token: tokenOf(sent[0]!.text), client: "native" }), env, 1000);
    expect(r.headers.get("Set-Cookie")).toBeNull();
    const body = (await r.json()) as { token: string };
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    const row = await env.DB.prepare("SELECT token_hash, kind FROM sessions").first<{ token_hash: string; kind: string }>();
    expect(row).toEqual({ token_hash: await sha256Hex(body.token), kind: "native" });
  });

  it("CSRF: non-JSON 415, foreign Origin 403", async () => {
    const { env } = setup();
    const form = new Request(`${ORIGIN}/api/v1/auth/request`, { method: "POST", body: "email=a@b.co", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN } });
    expect((await requestLink(form, env, 0)).status).toBe(415);
    expect((await requestLink(post("/api/v1/auth/request", { email: "a@b.co" }, { Origin: "https://evil.test" }), env, 0)).status).toBe(403);
    expect((await verifyLink(post("/api/v1/auth/verify", { token: "x" }, { Origin: "https://evil.test" }), env, 0)).status).toBe(403);
  });

  it("rate limits: 5/hour per email, 20/hour per IP key — still 202, no extra mail", async () => {
    const { env, sent } = setup();
    for (let i = 0; i < 7; i++) expect((await requestLink(post("/api/v1/auth/request", { email: "r@b.co" }), env, 1000 + i)).status).toBe(202);
    expect(sent).toHaveLength(5);
    for (let i = 0; i < 20; i++) await requestLink(post("/api/v1/auth/request", { email: `u${i}@b.co` }, { "CF-Connecting-IP": "203.0.113.9" }), env, 2000 + i);
    expect(sent).toHaveLength(25);
    await requestLink(post("/api/v1/auth/request", { email: "z@b.co" }, { "CF-Connecting-IP": "203.0.113.9" }), env, 3000);
    expect(sent).toHaveLength(25);
    await requestLink(post("/api/v1/auth/request", { email: "r@b.co" }), env, 1000 + 3_600_000);
    expect(sent).toHaveLength(26);
  });
});
