// P1.4 Verify: dark persists across reload with no light frame; settings persist.
import { expect, test } from "@playwright/test";

test("dark theme is applied before <body> exists and survives reload", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { themeAtBody?: string | null };
    new MutationObserver((_m, obs) => {
      if (document.body) {
        w.themeAtBody = document.documentElement.getAttribute("data-theme");
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/bsb/john/3");
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByLabel("Dark").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  expect(await page.evaluate(() => (window as unknown as { themeAtBody?: string }).themeAtBody)).toBe("dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(15, 15, 15)");
});

test("size, font, width and headings persist; Esc closes and returns focus", async ({ page }) => {
  await page.goto("/bsb/psalms/23");
  const btn = page.getByRole("button", { name: "Reading settings" });
  await btn.click();
  await page.locator('input[name="size"][value="4"]').check();
  await page.getByLabel("Sans").check();
  await page.getByLabel("Narrow").check();
  await page.getByLabel("Section headings").uncheck();
  await page.keyboard.press("Escape");
  await expect(btn).toBeFocused();
  await page.reload();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-size", "4");
  await expect(html).toHaveAttribute("data-font", "sans");
  await expect(html).toHaveAttribute("data-width", "narrow");
  await expect(html).toHaveAttribute("data-headings", "off");
  await expect(page.locator(".sec").first()).toBeHidden();
});
