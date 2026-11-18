// P6.7 Verify: SPEC A4 — a highlight made in context A appears in context B within 10 s of focus.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "cookie flow checked in Chromium");

async function signIn(ctx: BrowserContext, email: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto("/bsb/john/3");
  expect((await page.request.post("/api/v1/auth/request", { data: { email } })).status()).toBe(202);
  const mail = (await (await page.request.get(`/api/v1/dev/mail?to=${encodeURIComponent(email)}`)).json()) as { text: string };
  const link = new URL(/https?:\/\/\S+#token=[0-9a-f]{64}/.exec(mail.text)![0]);
  await page.goto(link.pathname + link.hash);
  await page.waitForURL((u) => u.pathname !== "/auth/verify");
  return page;
}
const verse = (page: Page, v: number) => page.locator(`article.chapter .v[data-v="${v}"]`).first();

test("two signed-in contexts converge within 10 s", async ({ browser }) => {
  const email = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const [ca, cb] = [await browser.newContext(), await browser.newContext()];
  const a = await signIn(ca, email);
  const b = await signIn(cb, email);
  for (const p of [a, b]) await p.goto("/bsb/john/3");
  await verse(a, 16).scrollIntoViewIfNeeded();
  await verse(a, 16).locator(".vn").click();
  const pushed = a.waitForResponse((r) => r.url().endsWith("/api/v1/highlights/batch") && r.ok());
  await a.getByRole("toolbar", { name: "Highlight" }).getByRole("button", { name: "Rose" }).click();
  await pushed; // 2 s after the write
  const t0 = Date.now();
  await b.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(verse(b, 16)).toHaveAttribute("data-hl", "rose", { timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(10_000);
  // Delete on B propagates back to A as a tombstone.
  await verse(b, 16).locator(".vn").click();
  const pushedB = b.waitForResponse((r) => r.url().endsWith("/api/v1/highlights/batch") && r.ok());
  await b.getByRole("toolbar", { name: "Highlight" }).getByRole("button", { name: "Remove highlight" }).click();
  await pushedB;
  await a.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(verse(a, 16)).not.toHaveAttribute("data-hl", /.*/, { timeout: 10_000 });
  await ca.close();
  await cb.close();
});
