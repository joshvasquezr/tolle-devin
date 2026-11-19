// P7.3 Verify (SPEC §7 Privacy, D§8): the Worker never logs IPs, emails, tokens or queries — no
// console calls in source, and a full auth + sync flow writes nothing to the console.
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index.ts";
import type { Env } from "./env.ts";
import { testDb } from "./testdb.ts";

const srcFiles = (dir: URL): URL[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? srcFiles(new URL(`${e.name}/`, dir)) : e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && e.name !== "testdb.ts" ? [new URL(e.name, dir)] : []));

describe("log redaction", () => {
  afterEach(() => vi.restoreAllMocks());
  it("worker source has no console calls", () => {
    const offenders = srcFiles(new URL("./", import.meta.url)).filter((f) => /\bconsole\.(log|info|warn|error|debug|trace)\b/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.pathname)).toEqual([]);
  });
  it("auth, account and sync requests write nothing to the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const sent: string[] = [];
    const env: Env = { ASSETS: { fetch: async () => new Response("", { status: 404 }) }, DB: testDb(), MAILER: { send: async (m) => void sent.push(m.text) } };
    const O = "https://quiet.test";
    const post = (p: string, body: unknown, h: Record<string, string> = {}) =>
      worker.fetch(new Request(`${O}${p}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", Origin: O, "CF-Connecting-IP": "203.0.113.7", ...h } }), env);
    await post("/api/v1/auth/request", { email: "private@example.com" });
    const token = /#token=([0-9a-f]+)/.exec(sent[0]!)![1];
    const v = await post("/api/v1/auth/verify", { token, client: "native" });
    const bearer = { Authorization: `Bearer ${((await v.json()) as { token: string }).token}` };
    await post("/api/v1/highlights/batch", { items: [{ verseId: 43003016, color: "sand", updatedAt: Date.now() }] }, bearer);
    await worker.fetch(new Request(`${O}/api/v1/highlights?since=0`, { headers: bearer }), env);
    await worker.fetch(new Request(`${O}/api/v1/me`, { headers: bearer }), env);
    await post("/api/v1/auth/verify", { token: "f".repeat(64) });
    await worker.fetch(new Request(`${O}/search?q=love+your+enemies`), env);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
