// P1.8 / D§2: unmatched paths get the static 404 page with status 404; /api/* is JSON.
import { describe, expect, it } from "vitest";
import worker from "./index.ts";
import type { Env } from "./env.ts";

const env = (pages: Record<string, string>): Env => ({
  ASSETS: {
    fetch: async (input) => {
      const path = new URL(typeof input === "string" ? input : input.url).pathname;
      return path in pages ? new Response(pages[path], { status: 200 }) : new Response("", { status: 404 });
    },
  },
});

describe("worker", () => {
  it("serves the 404 page with status 404", async () => {
    const res = await worker.fetch(new Request("https://x.test/nope"), env({ "/404": "<h1>Not found</h1>" }));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<h1>Not found</h1>");
  });

  it("falls back to plain text if the 404 page is missing", async () => {
    const res = await worker.fetch(new Request("https://x.test/nope"), env({}));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("unknown API paths are JSON 404s", async () => {
    const res = await worker.fetch(new Request("https://x.test/api/v1/x"), env({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
