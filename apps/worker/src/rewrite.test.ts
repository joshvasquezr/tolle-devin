// D§6.3 rewrite helpers.
import { expect, it } from "vitest";
import { rewriteVerseHtml, trimDescription } from "./rewrite.ts";

it("escapes injected values", () => {
  const html = rewriteVerseHtml('<title>x</title><meta name="description" content="a"><main id="main">', {
    title: '<b>"t"</b>', description: '"><script>', canonical: "https://x.test/a", focus: "1-1", crumbName: "n",
  });
  expect(html).toContain("<title>&lt;b&gt;&quot;t&quot;&lt;/b&gt;</title>");
  expect(html).toContain('content="&quot;&gt;&lt;script&gt;"');
});

it("trims on a word boundary", () => {
  expect(trimDescription("short")).toBe("short");
  const t = trimDescription("word ".repeat(60));
  expect(t.length).toBeLessThanOrEqual(155);
  expect(t.endsWith("word…")).toBe(true);
});
