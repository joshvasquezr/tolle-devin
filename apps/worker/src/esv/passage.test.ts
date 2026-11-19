// P5.4 Verify: D§3.12 Passage flow with mocked upstream — hit, miss, soft, hard, bad part, key never in responses.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ESV_CITATION } from "@tolle/core";
import { EsvBudget } from "./budget.ts";
import { handleEsvPassage, type EsvDeps } from "./passage.ts";
import { Limiter } from "../auth/ratelimit.ts";
import worker from "../index.ts";
import type { Env } from "../env.ts";

const KEY = "test-key-0123456789abcdef0123456789abcdef";
const fixture = readFileSync(new URL("../../test/fixtures/esv/john-3.json", import.meta.url), "utf8");
const NOW = 50 * 86_400_000;

function setup(opts: { ts?: number[]; upstream?: () => Response } = {}) {
  const data = new Map<string, unknown>([["ts", opts.ts ?? []]]);
  const state = {
    storage: { get: async <T>(k: string) => data.get(k) as T | undefined, put: async <T>(k: string, v: T) => void data.set(k, v) },
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(),
  };
  const budget = new EsvBudget(state, undefined, () => NOW);
  const calls: { url: string; auth: string | null }[] = [];
  const deps: EsvDeps = {
    now: () => NOW,
    visitors: new Limiter(20, 60_000),
    inflight: new Map(),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get("Authorization") });
      await new Promise((r) => setTimeout(r, 5));
      return opts.upstream ? opts.upstream() : new Response(fixture, { headers: { "Content-Type": "application/json" } });
    }) as typeof fetch,
  };
  const env = {
    ASSETS: { fetch: async () => new Response("asset") },
    ESV_API_KEY: KEY,
    ESV_ENABLED: "1",
    ESV_BUDGET: { idFromName: () => "global", get: () => ({ fetch: (i: Request | string, n?: RequestInit) => budget.fetch(new Request(i, n)) }) },
  };
  const get = (qs: string, ip = "203.0.113.7") => handleEsvPassage(new Request(`https://x/api/v1/esv/passage?${qs}`, { headers: { "CF-Connecting-IP": ip } }), env, deps);
  return { get, calls, env, data };
}

describe("ESV passage endpoint", () => {
  it("miss then hit: one upstream call, Block[] + citation, private caching, key only upstream", async () => {
    const s = setup();
    const a = await s.get("book=john&chapter=3");
    const text = await a.text();
    expect(a.status).toBe(200);
    expect(a.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(a.headers.get("X-Robots-Tag")).toBe("noindex");
    const body = JSON.parse(text);
    expect(body).toMatchObject({ tr: "esv", book: "john", chapter: 3, part: 1, parts: 1, range: [1, 36], copyright: ESV_CITATION });
    expect(text).not.toMatch(/<[a-z]/i);
    expect(text).not.toContain(KEY);
    expect([...a.headers.values()].join(" ")).not.toContain(KEY);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.auth).toBe(`Token ${KEY}`);
    expect(s.calls[0]!.url).not.toContain(KEY);
    expect(new URL(s.calls[0]!.url).searchParams.get("q")).toBe("John 3:1-36");
    const b = await s.get("book=john&chapter=3&part=1");
    expect(b.status).toBe(200);
    expect(s.calls).toHaveLength(1);
  });
  it("single-flight: concurrent misses share one upstream call", async () => {
    const s = setup();
    const rs = await Promise.all([s.get("book=john&chapter=3"), s.get("book=john&chapter=3"), s.get("book=john&chapter=3")]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(s.calls).toHaveLength(1);
  });
  it("soft state: misses get 503 esv_busy, cached windows still serve", async () => {
    const soft = setup({ ts: Array.from({ length: 48 }, (_, i) => NOW - 1000 - i) });
    const r = await soft.get("book=john&chapter=3");
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "esv_busy" });
    expect(soft.calls).toHaveLength(0);
  });
  it("cache-only in soft state: a window cached before the budget tightened is still served", async () => {
    const s = setup();
    expect((await s.get("book=john&chapter=3")).status).toBe(200);
    // Push the shared budget into soft by recording 48 calls through the DO.
    for (let i = 0; i < 48; i++) await s.env.ESV_BUDGET.get().fetch("https://esv-budget/consume", { method: "POST", body: "{}" });
    expect((await s.get("book=john&chapter=3")).status).toBe(200);
    expect((await s.get("book=jude&chapter=1")).status).toBe(503);
    expect(s.calls).toHaveLength(1);
  });
  it("hard state: 503 esv_busy, no upstream call", async () => {
    const s = setup({ ts: Array.from({ length: 57 }, (_, i) => NOW - 1000 - i) });
    const r = await s.get("book=jude&chapter=1");
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "esv_busy" });
    expect(s.calls).toHaveLength(0);
  });
  it.each(["book=john&chapter=3&part=2", "book=john&chapter=3&part=0", "book=john&chapter=22", "book=nope&chapter=1", "book=john&chapter=x", "book=john&chapter=3&part=01", "chapter=3"])(
    "bad input %s → 400 bad_request, no upstream",
    async (qs) => {
      const s = setup();
      const r = await s.get(qs);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "bad_request" });
      expect(s.calls).toHaveLength(0);
    },
  );
  it("upstream failure or a range wider than the window → 503 esv_unavailable, nothing cached", async () => {
    const down = setup({ upstream: () => new Response("err", { status: 500 }) });
    expect(await (await down.get("book=john&chapter=3")).json()).toEqual({ error: "esv_unavailable" });
    const wide = setup({ upstream: () => Response.json({ parsed: [[43003001, 43004054]], passages: ["<p>x</p>"] }) });
    expect((await wide.get("book=john&chapter=3")).status).toBe(503);
    expect((await wide.get("book=john&chapter=3")).status).toBe(503);
    expect(wide.calls).toHaveLength(2);
  });
  it("per-visitor limit: 21st request in a minute → 429 rate_limited", async () => {
    const s = setup();
    for (let i = 0; i < 20; i++) expect((await s.get("book=john&chapter=3")).status).toBe(200);
    expect((await s.get("book=john&chapter=3")).status).toBe(429);
    expect((await s.get("book=john&chapter=3", "198.51.100.1")).status).toBe(200);
  });
  it("compliance gate: without ESV_ENABLED the Worker answers 404", async () => {
    const s = setup();
    const env = { ...s.env, ESV_ENABLED: undefined } as unknown as Env;
    const r = await worker.fetch(new Request("https://x/api/v1/esv/passage?book=john&chapter=3"), env);
    expect(r.status).toBe(404);
    expect(s.calls).toHaveLength(0);
  });
});
