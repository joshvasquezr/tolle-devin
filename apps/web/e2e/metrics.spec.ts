// P7.4 Verify: a metrics beacon carries no identifiers and sets no cookies (SPEC §7, §11).
import { expect, test } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "network capture in Chromium");

test("metrics endpoint: anonymous, cookieless", async ({ page, context }) => {
  await page.goto("/bsb/john/3");
  const res = await page.evaluate(async () => {
    const r = await fetch("/api/v1/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "search_used", bucket: "1" }) });
    return { status: r.status, cookie: r.headers.get("set-cookie") };
  });
  expect(res).toEqual({ status: 204, cookie: null });
  expect(await context.cookies()).toEqual([]);
  expect((await page.request.post("/api/v1/metrics", { data: { name: "user_id", bucket: "x" } })).status()).toBe(400);
});
