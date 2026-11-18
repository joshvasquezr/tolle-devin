// D§8 CSP: every executable inline script in the build is allowed by a hash in dist/_headers.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const headers = readFileSync(new URL("../dist/_headers", import.meta.url), "utf8");
const allowed = new Set([...headers.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]!));

test("inline scripts on built pages all match CSP hashes", async ({ request }) => {
  for (const url of ["/", "/bsb/john/3", "/kjv/psalms/23", "/about", "/privacy", "/404"]) {
    const html = await (await request.get(url)).text();
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/application\/ld\+json/.test(m[1]!));
    for (const m of inline) {
      const hash = createHash("sha256").update(m[2]!).digest("base64");
      expect(allowed.has(hash), `${url}: inline script ${m[2]!.slice(0, 60)}…`).toBe(true);
    }
    expect(html).not.toMatch(/\sstyle="/);
  }
});
