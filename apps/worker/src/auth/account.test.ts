// P6.3 Verify: SPEC A7, A8 — sessions (cookie/bearer, 90-day extension), me, sign-out, export, delete cascade.
import { describe, expect, it } from "vitest";
import { testDb } from "../testdb.ts";
import { handleAccount } from "./account.ts";
import { newLimits, requestLink, verifyLink, type AuthEnv } from "./auth.ts";

const O = "https://quiet.test";
const DAY = 86_400_000;
async function signIn(client: "web" | "native" = "web") {
  const sent: { text: string }[] = [];
  const env: AuthEnv = { DB: testDb(), mailer: { send: async (m) => void sent.push(m) }, limits: newLimits() };
  const h = { "Content-Type": "application/json", Origin: O };
  await requestLink(new Request(`${O}/x`, { method: "POST", headers: h, body: JSON.stringify({ email: "a@b.co" }) }), env, 0);
  const token = /#token=([0-9a-f]+)/.exec(sent[0]!.text)![1];
  const r = await verifyLink(new Request(`${O}/x`, { method: "POST", headers: h, body: JSON.stringify({ token, client }) }), env, 1000);
  const body = (await r.json()) as { user: { id: string }; token?: string };
  const auth = client === "web" ? { Cookie: r.headers.get("Set-Cookie")!.split(";")[0]! } : { Authorization: `Bearer ${body.token}` };
  return { db: env.DB, auth, id: body.user.id };
}
const req = (method: string, path: string, headers: Record<string, string>, json = method !== "GET") =>
  new Request(`${O}${path}`, { method, headers: { ...headers, ...(json ? { "Content-Type": "application/json", Origin: O } : {}) }, ...(json ? { body: "{}" } : {}) });

describe("account", () => {
  it("me via cookie and via bearer; 401 without a session; unrelated routes pass through", async () => {
    const web = await signIn("web");
    expect(await (await handleAccount(req("GET", "/api/v1/me", web.auth), web.db, 2000))!.json()).toEqual({ id: web.id, email: "a@b.co" });
    const nat = await signIn("native");
    expect((await handleAccount(req("GET", "/api/v1/me", nat.auth), nat.db, 2000))!.status).toBe(200);
    expect((await handleAccount(req("GET", "/api/v1/me", {}), web.db, 2000))!.status).toBe(401);
    expect(await handleAccount(req("GET", "/api/v1/other", {}), web.db, 0)).toBeNull();
  });
  it("sessions expire after 90 days and are extended when < 30 days remain", async () => {
    const { db, auth } = await signIn();
    const me = (t: number) => handleAccount(req("GET", "/api/v1/me", auth), db, t);
    expect((await me(10 * DAY))!.headers.get("Set-Cookie")).toBeNull();
    const ext = await me(70 * DAY);
    expect(ext!.headers.get("Set-Cookie")).toMatch(/Max-Age=7776000/);
    expect((await me(150 * DAY))!.status).toBe(200); // extended to day 160
    expect((await me(400 * DAY))!.status).toBe(401);
  });
  it("sign-out deletes the session and clears the cookie", async () => {
    const { db, auth } = await signIn();
    const r = await handleAccount(req("POST", "/api/v1/auth/signout", auth), db, 2000);
    expect(r!.status).toBe(204);
    expect(r!.headers.get("Set-Cookie")).toMatch(/^__Host-session=; .*Max-Age=0$/);
    expect((await handleAccount(req("GET", "/api/v1/me", auth), db, 3000))!.status).toBe(401);
    expect((await handleAccount(req("POST", "/api/v1/auth/signout", auth, false), db, 3000))!.status).toBe(415);
  });
  it("export returns account + live highlights; delete cascades every row", async () => {
    const { db, auth, id } = await signIn();
    await db.prepare("INSERT INTO highlights VALUES (?1, 43003016, 'sand', 5, 0, 1), (?1, 1001001, NULL, 6, 1, 2)").bind(id).run();
    const ex = await handleAccount(req("GET", "/api/v1/account/export", auth), db, 2000);
    expect(await ex!.json()).toEqual({ version: 1, user: { id, email: "a@b.co", createdAt: 1 }, items: [{ verseId: 43003016, color: "sand", updatedAt: 5 }] });
    expect((await handleAccount(req("DELETE", "/api/v1/account", auth), db, 3000))!.status).toBe(204);
    for (const t of ["users", "sessions", "highlights"]) expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())!.n).toBe(0);
  });
});
