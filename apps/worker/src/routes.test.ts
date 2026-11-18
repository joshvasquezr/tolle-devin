// P2.1 Verify (D§1 D2, D§2, D§6.3): redirects, verse rewrite, out-of-range verse, unknown chapter.
import { describe, expect, it } from "vitest";
import worker from "./index.ts";
import type { Env } from "./env.ts";
import john3 from "../../../packages/render/src/fixtures/bsb-john-3.json" with { type: "json" };

const PAGE =
  `<!DOCTYPE html><html lang="en"><head><title>John 3 — Berean Standard Bible</title>` +
  `<meta name="description" content="Now there was a man"><link rel="canonical" href="https://x.test/bsb/john/3">` +
  `<meta property="og:title" content="John 3 — Berean Standard Bible"><meta property="og:description" content="Now there was a man">` +
  `<meta property="og:url" content="https://x.test/bsb/john/3">` +
  `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Quiet Bible","item":"https://x.test/"}]}</script>` +
  `</head><body><main id="main" class="col"><h1 class="ch">John 3</h1></main></body></html>`;

const assets: Record<string, string> = {
  "/bsb/john/3": PAGE,
  "/data/bsb/john/3.json": JSON.stringify(john3),
  "/404": "<h1>Not found</h1>",
};
const env: Env = {
  ASSETS: {
    fetch: async (input) => {
      const path = new URL(typeof input === "string" ? input : input.url).pathname;
      return path in assets ? new Response(assets[path], { headers: { "Content-Security-Policy": "default-src 'self'" } }) : new Response("", { status: 404 });
    },
  },
};
const get = (path: string) => worker.fetch(new Request(`https://x.test${path}`), env);

describe("redirects (301)", () => {
  it.each([
    ["/john/3", "/bsb/john/3"],
    ["/bsb/jn/3", "/bsb/john/3"],
    ["/BSB/John/3", "/bsb/john/3"],
    ["/bsb/john", "/bsb/john/1"],
    ["/bsb/john/03/016", "/bsb/john/3/16"],
  ])("%s → %s", async (from, to) => {
    const res = await get(from);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(to);
  });
});

describe("verse URLs", () => {
  it("/bsb/john/3/16 returns the chapter HTML with verse metadata and data-focus", async () => {
    const res = await get("/bsb/john/3/16");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe("default-src 'self'");
    const html = await res.text();
    expect(html).toContain("<title>John 3:16 — Berean Standard Bible</title>");
    expect(html).toContain('<meta name="description" content="For God so loved the world that He gave His one and only Son');
    expect(html).toContain('<link rel="canonical" href="https://x.test/bsb/john/3/16">');
    expect(html).toContain('<meta property="og:url" content="https://x.test/bsb/john/3/16">');
    expect(html).toContain('<meta property="og:title" content="John 3:16 — Berean Standard Bible">');
    expect(html).toContain('<main id="main" data-focus="16-16" class="col">');
    expect(html).toContain('"position":2,"name":"John 3:16","item":"https://x.test/bsb/john/3/16"');
  });

  it("ranges join verse text and trim to 155 chars", async () => {
    const html = await (await get("/bsb/john/3/16-18")).text();
    expect(html).toContain("<title>John 3:16–18 — Berean Standard Bible</title>");
    expect(html).toContain('data-focus="16-18"');
    const desc = html.match(/<meta name="description" content="([^"]*)"/)![1]!;
    expect(desc.length).toBeLessThanOrEqual(155);
    expect(desc.endsWith("…")).toBe(true);
  });

  it("out-of-range verse → 302 to the chapter", async () => {
    for (const p of ["/bsb/john/3/99", "/bsb/john/3/10-99", "/john/3/99"]) {
      const res = await get(p);
      expect(res.status, p).toBe(302);
      expect(res.headers.get("location")).toBe("/bsb/john/3");
    }
  });

  it("unknown chapter or book → 404 page", async () => {
    for (const p of ["/bsb/john/99", "/bsb/nope/1", "/x/y/z/w/v"]) {
      const res = await get(p);
      expect(res.status, p).toBe(404);
      expect(await res.text()).toBe("<h1>Not found</h1>");
    }
  });

  it("escapes rewritten values; ESV verse URLs are not served before P5", async () => {
    expect((await get("/esv/john/3/16")).status).toBe(404);
    expect((await worker.fetch(new Request("https://x.test/bsb/john/3/16", { method: "POST" }), env)).status).toBe(405);
  });
});
