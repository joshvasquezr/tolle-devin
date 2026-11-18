// SPEC §7 WCAG 2.2 AA: axe on reading pages and the settings popover, light and dark.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const scheme of ["light", "dark"] as const) {
  test(`axe clean (${scheme}): chapter, poetry, landing, open popover`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    for (const url of ["/", "/bsb/john/3", "/kjv/psalms/23"]) {
      await page.goto(url);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(r.violations, url).toEqual([]);
    }
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Reading settings" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    const r = await new AxeBuilder({ page }).include("#aa-pop").analyze();
    expect(r.violations).toEqual([]);
  });
}
