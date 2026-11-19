// P5.5 Verify: D§3.12 ESV search, SPEC S6 — page size within every book's cap, shared budget, key only upstream.
import { describe, expect, it } from "vitest";
import { BOOKS, ESV_CITATION, esvCap } from "@tolle/core";
import { EsvBudget } from "./budget.ts";
import { handleEsvSearch, SEARCH_PAGE_SIZE } from "./search.ts";
import { handleEsvPassage, type EsvDeps } from "./passage.ts";
import { Limiter } from "../auth/ratelimit.ts";

const KEY = "fake-esv-key";
const NOW = 60 * 86_400_000;
const upstreamBody = { page: 1, total_pages: 3, total_results: 25, results: [{ reference: "John 3:16", content: "Placeholder <b>words</b> one." }, { reference: "Jude 1:3", content: "Placeholder two." }, { reference: "nonsense", content: "x" }] };

function setup(ts: number[] = [], upstream = () => Response.json(upstreamBody)) {
  const data = new Map<string, unknown>([["ts", ts]]);
  const budget = new EsvBudget({ storage: { get: async <T>(k: string) => data.get(k) as T, put: async <T>(k: string, v: T) => void data.set(k, v) }, blockConcurrencyWhile: <T>(f: () => Promise<T>) => f() }, undefined, () => NOW);
  const calls: { url: string; auth: string | null }[] = [];
  const deps: EsvDeps = { now: () => NOW, visitors: new Limiter(20, 60_000), inflight: new Map(), fetch: (async (i: RequestInfo | URL, n?: RequestInit) => (calls.push({ url: String(i), auth: new Headers(n?.headers).get("Authorization") }), upstream())) as typeof fetch };
  const env = { ASSETS: { fetch: async () => new Response() }, ESV_API_KEY: KEY, ESV_ENABLED: "1", ESV_BUDGET: { idFromName: () => "global", get: () => ({ fetch: (i: Request | string, n?: RequestInit) => budget.fetch(new Request(i, n)) }) } };
  return { calls, env, deps, get: (qs: string) => handleEsvSearch(new Request(`https://x/api/v1/esv/search?${qs}`), env, deps) };
}

describe("ESV search endpoint", () => {
  it("page size fits the smallest per-book cap", () => {
    expect(SEARCH_PAGE_SIZE).toBeLessThanOrEqual(Math.min(...BOOKS.map((b) => esvCap(b.id))));
    expect(SEARCH_PAGE_SIZE).toBeGreaterThan(0);
  });
  it("proxies with page-size, maps references, strips markup, adds the citation, key only upstream", async () => {
    const s = setup();
    const r = await s.get("q=%20love%20%20one&page=2");
    const text = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(JSON.parse(text)).toEqual({ query: "love one", page: 2, pages: 3, copyright: ESV_CITATION, results: [{ book: "john", chapter: 3, verse: 16, text: "Placeholder words one." }, { book: "jude", chapter: 1, verse: 3, text: "Placeholder two." }] });
    expect(text).not.toContain(KEY);
    const u = new URL(s.calls[0]!.url);
    expect([u.searchParams.get("q"), u.searchParams.get("page-size"), u.searchParams.get("page")]).toEqual(["love one", String(SEARCH_PAGE_SIZE), "2"]);
    expect(s.calls[0]!.auth).toBe(`Token ${KEY}`);
  });
  it("shares the budget: search calls count toward it and are refused in soft state", async () => {
    const soft = setup(Array.from({ length: 48 }, (_, i) => NOW - 1000 - i));
    expect(await (await soft.get("q=love")).json()).toEqual({ error: "esv_busy" });
    expect(soft.calls).toHaveLength(0);
    const s = setup(Array.from({ length: 47 }, (_, i) => NOW - 1000 - i));
    expect((await s.get("q=love")).status).toBe(200);
    // That search was the 48th call: passages now get cache-only treatment.
    const p = await handleEsvPassage(new Request("https://x/api/v1/esv/passage?book=jude&chapter=1"), s.env, s.deps);
    expect(p.status).toBe(503);
  });
  it.each(["q=", "q=%20%20", `q=${"a".repeat(201)}`, "q=love&page=0", "q=love&page=x", ""])("bad input %s → 400", async (qs) => {
    const s = setup();
    expect((await s.get(qs)).status).toBe(400);
    expect(s.calls).toHaveLength(0);
  });
  it("upstream failure → 503 esv_unavailable", async () => {
    const s = setup([], () => new Response("no", { status: 502 }));
    expect(await (await s.get("q=love")).json()).toEqual({ error: "esv_unavailable" });
  });
});
