// P1.6 Verify: next/prev/back without reload, focus + live region, scroll restore, fallback, prefetch, CLS.
import { expect, test } from "@playwright/test";

test("next/prev/back swap chapters without a page reload", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await page.goto("/bsb/genesis/50");
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await expect.poll(() => requests.includes("/data/bsb/exodus/1.json")).toBe(true); // idle prefetch

  await page.getByRole("link", { name: "Exodus 1 →" }).click();
  await expect(page).toHaveURL("/bsb/exodus/1");
  await expect(page.locator("h1")).toHaveText("Exodus 1");
  await expect(page.locator("h1 .ch-btn")).toBeFocused();
  await expect(page.locator("#live")).toHaveText("Exodus 1");
  await expect(page).toHaveTitle("Exodus 1 — Berean Standard Bible");
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  expect(requests.filter((r) => r === "/bsb/exodus/1")).toEqual([]);

  await page.getByRole("link", { name: "← Genesis 50" }).click();
  await expect(page).toHaveURL("/bsb/genesis/50");
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("Exodus 1");
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
});

test("popstate restores scroll; forward navigation resets to top", async ({ page }) => {
  await page.goto("/kjv/psalms/119");
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForFunction(() => window.scrollY >= 2900);
  await page.locator('a[rel="next"]').scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  await page.locator('a[rel="next"]').click();
  await expect(page.locator("h1")).toHaveText("Psalm 120");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("Psalm 119");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
});

test("fetch failure falls back to normal navigation", async ({ page }) => {
  await page.goto("/web/john/3");
  await page.route("**/data/web/john/4.json", (r) => r.abort());
  await page.getByRole("link", { name: "John 4 →" }).click();
  await expect(page).toHaveURL("/web/john/4");
  await expect(page.locator("h1")).toHaveText("John 4");
});

test("chapter change causes no layout shift (CLS ≤ 0.02)", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.evaluate(() => {
    const w = window as unknown as { cls: number };
    w.cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number }[]) w.cls += e.value;
    }).observe({ type: "layout-shift", buffered: false });
  });
  for (let i = 0; i < 3; i++) {
    await page.locator('a[rel="next"]').click();
    await expect(page.locator("h1")).toHaveText(`John ${4 + i}`);
  }
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("John 5");
  expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThanOrEqual(0.02);
});
