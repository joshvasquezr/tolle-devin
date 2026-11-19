// P7.1 automated part (SPEC §6.10; D§5.4): axe on every key page and open popover in both schemes,
// 320 px reflow with no horizontal scrolling, and 200% zoom keeps the bar and text usable.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "axe pass runs in Chromium");

const PAGES = ["/", "/about", "/privacy", "/search?q=love+your+enemies", "/bsb/john/3", "/kjv/psalms/23", "/web/jude/1", "/auth/verify", "/no-such-page"];
const axe = async (page: Page, include?: string) => {
  const b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  return (await (include ? b.include(include) : b).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

for (const scheme of ["light", "dark"] as const) {
  test(`axe clean on key pages (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    for (const url of PAGES) {
      await page.goto(url);
      if (url.startsWith("/search")) await page.locator("#search-results li").first().waitFor();
      expect(await axe(page), url).toEqual([]);
    }
  });

  test(`axe clean on open popovers (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/bsb/john/3");
    for (const [name, sel] of [["Reading settings", "#aa-pop"], ["Sign in", "#acct-pop"]] as const) {
      await page.getByRole("button", { name }).click();
      await expect(page.locator(sel)).toBeVisible();
      expect(await axe(page), name).toEqual([]);
      await page.keyboard.press("Escape");
    }
    await page.locator("article.chapter .v[data-v='16'] .vn").first().click();
    await expect(page.getByRole("toolbar", { name: "Highlight" })).toBeVisible();
    expect(await axe(page), "toolbar").toEqual([]);
  });
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("320 px reflow: no horizontal scrolling on key pages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const url of PAGES) {
    await page.goto(url);
    expect(await noHScroll(page), url).toBe(true);
  }
  await page.goto("/bsb/john/3");
  for (const name of ["Reading settings", "Sign in"]) {
    await page.getByRole("button", { name }).click();
    expect(await noHScroll(page), name).toBe(true);
    await page.keyboard.press("Escape");
  }
});

test("200% zoom (1280 px window → 640 CSS px): bar controls reachable, text reflows", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("/bsb/john/3");
  expect(await noHScroll(page)).toBe(true);
  for (const name of ["Reading settings", "Sign in"]) await expect(page.getByRole("button", { name })).toBeInViewport();
  await page.keyboard.press("/");
  await expect(page.getByRole("combobox").first()).toBeFocused();
  await ctx.close();
});
