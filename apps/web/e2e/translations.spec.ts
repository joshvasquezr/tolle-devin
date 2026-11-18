// P2.6 Verify: SPEC T2/T3 — John 3:16 BSB → KJV keeps verse 16 in view; URL and title update.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("John 3:16 BSB → KJV keeps verse 16 at the same place", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("/bsb/john/3/16");
  const v16 = () => page.locator('article .v[data-v="16"]').first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const before = await v16();
  // Keyboard path: a mouse click on the header button would first scroll it into view (the bar
  // only becomes sticky/revealed with P2.7 chrome), which is not what is under test here.
  await expect(page.getByRole("button", { name: "Translation: BSB" })).toHaveAttribute("aria-expanded", "false");
  await page.mouse.click(5, 650);
  await page.keyboard.press("t");
  const pop = page.getByRole("dialog", { name: "Choose a translation" });
  await expect(pop.getByRole("button")).toHaveCount(3);
  await pop.getByRole("button", { name: /King James Version/ }).click();
  await expect(page).toHaveURL("/kjv/john/3/16");
  await expect(page).toHaveTitle("John 3:16 — King James Version");
  await expect(page.locator("article.chapter")).toHaveAttribute("data-tr", "kjv");
  await expect(page.locator(".v.focus")).toHaveAttribute("data-v", "16");
  expect(Math.abs((await v16()) - before)).toBeLessThanOrEqual(30);
  await expect(page.getByRole("button", { name: "Translation: KJV" })).toBeVisible();
});

test("T opens the switcher; chapter pages keep the scrolled verse", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("/web/psalms/119");
  await page.locator('article .v[data-v="100"]').first().scrollIntoViewIfNeeded();
  const top = await page.locator('article .v[data-v="100"]').first().evaluate((el) => el.getBoundingClientRect().top);
  await page.mouse.click(5, 650);
  await page.keyboard.press("t");
  await expect(page.getByRole("dialog", { name: "Choose a translation" })).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const r = await new AxeBuilder({ page }).include("#tr-pop").include("header").analyze();
    expect(r.violations, scheme).toEqual([]);
  }
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/bsb/psalms/119");
  const after = await page.locator('article .v[data-v="100"]').first().evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(after - top)).toBeLessThanOrEqual(40);
});
