// P3.4 Verify: SPEC S1–S4 via the reference bar; pagination; scope; empty state; axe.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("type 'faith without works' in the bar → James 2 appears", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.keyboard.press("/");
  await page.keyboard.type("faith without works");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=faith(%20|\+)without(%20|\+)works&t=bsb/);
  const rows = page.locator("#search-results li");
  await expect(rows.first()).toBeVisible();
  await expect(page.locator("#search-results a").filter({ hasText: /^James 2:/ }).first()).toBeVisible();
  await expect(page.locator("#search-results mark").first()).toBeVisible();
  await page.locator("#search-results a").filter({ hasText: /^James 2:/ }).first().click();
  await expect(page).toHaveURL(/\/bsb\/james\/2\/\d+$/);
  await expect(page.locator(".v.focus").first()).toBeVisible();
});

test("S1 top 3, pagination, scope, translation switch, empty state, axe", async ({ page }) => {
  await page.goto("/search?q=love+your+enemies&t=web");
  await expect(page.locator("#search-results li").first()).toBeVisible();
  const top3 = await page.locator("#search-results a").evaluateAll((as) => as.slice(0, 3).map((a) => a.textContent));
  expect(top3).toContain("Matthew 5:44");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations, scheme).toEqual([]);
  }
  await page.goto("/search?q=lord&t=kjv");
  await expect(page.locator("#search-results li")).toHaveCount(25);
  await expect(page.locator("#search-page")).toContainText("Page 1 of");
  await page.locator("#search-next").click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("#search-page")).toContainText("Page 2 of");
  await expect(page.locator("#search-results li")).toHaveCount(25);
  await page.selectOption("#search-scope", "psalms");
  await expect(page).toHaveURL(/scope=psalms/);
  await expect(page.locator("#search-results li").first()).toBeVisible();
  expect((await page.locator("#search-results a").allTextContents()).every((t) => t.startsWith("Psalm "))).toBe(true);
  await page.keyboard.press("t");
  await page.getByRole("dialog", { name: "Choose a translation" }).getByRole("button", { name: /Berean/ }).click();
  await expect(page).toHaveURL(/t=bsb/);
  await page.goto("/search?q=zzzqqq&t=bsb");
  await expect(page.locator("#search-status")).toHaveText("No verses found for “zzzqqq”.");
});
