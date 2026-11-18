// P4.3 Verify: D§3.10 Toolbar/Apply/Paint; SPEC §5.5, §6.8 — apply, change, remove, keys, a11y, screenshots.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const verse = (page: Page, v: number) => page.locator(`article.chapter .v[data-v="${v}"]`);
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Highlight" });

async function pick(page: Page, a: number, b = a) {
  await verse(page, a).first().locator(".vn").click();
  if (b !== a) await verse(page, b).first().locator(".vn").click({ modifiers: ["Shift"] });
}

test("toolbar: apply, change, remove whole verses; placement; screen-reader text", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await verse(page, 16).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await pick(page, 16, 17);
  await expect(toolbar(page)).toBeVisible();
  await expect(toolbar(page).getByRole("button", { name: "Remove highlight" })).toBeHidden();
  const tb = (await toolbar(page).boundingBox())!;
  const v16 = (await verse(page, 16).first().boundingBox())!;
  expect(tb.height).toBe(36);
  expect(tb.y + tb.height).toBeLessThanOrEqual(v16.y);
  await toolbar(page).getByRole("button", { name: "Sand" }).click();
  await expect(toolbar(page)).toBeHidden();
  for (const v of [16, 17]) for (const f of await verse(page, v).all()) await expect(f).toHaveAttribute("data-hl", "sand");
  await expect(verse(page, 18).first()).not.toHaveAttribute("data-hl", /.*/);
  await expect(verse(page, 16).last().locator(".hl-sr")).toHaveText(" (highlighted)");
  await expect(page.locator("#live")).toHaveText("Verses 16 to 17 highlighted Sand");
  const bg = await verse(page, 16).first().evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).getPropertyValue("box-decoration-break") || getComputedStyle(el).getPropertyValue("-webkit-box-decoration-break")]);
  expect(bg).toEqual(["rgb(241, 235, 221)", "clone"]);

  await pick(page, 17);
  await expect(toolbar(page).getByRole("button", { name: "Remove highlight" })).toBeVisible();
  await toolbar(page).getByRole("button", { name: "Slate" }).click();
  await expect(verse(page, 17).first()).toHaveAttribute("data-hl", "slate");
  await expect(verse(page, 16).first()).toHaveAttribute("data-hl", "sand");

  await pick(page, 16, 17);
  await toolbar(page).getByRole("button", { name: "Remove highlight" }).click();
  await expect(page.locator("article.chapter .v[data-hl]")).toHaveCount(0);
  await expect(page.locator(".hl-sr")).toHaveCount(0);
});

test("toolbar flips below when there is no room above", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.evaluate(() => {
    const el = document.querySelector('article.chapter .v[data-v="5"]')!;
    scrollTo({ top: scrollY + el.getBoundingClientRect().top - 10, behavior: "instant" });
  });
  // A real click would make Playwright scroll the number out from under the sticky bar.
  await verse(page, 5).first().locator(".vn").dispatchEvent("click");
  await expect(toolbar(page)).toBeVisible();
  const tb = (await toolbar(page).boundingBox())!;
  const v = (await verse(page, 5).first().boundingBox())!;
  expect(tb.y).toBeGreaterThanOrEqual(v.y);
});

test("keys 1–4 apply, 0 and Backspace remove; text selection path works", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.locator("article.chapter").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("2");
  await expect(verse(page, 1).first()).toHaveAttribute("data-hl", "sage");
  await expect(verse(page, 2).first()).toHaveAttribute("data-hl", "sage");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("4");
  await expect(verse(page, 3).first()).toHaveAttribute("data-hl", "rose");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("0");
  await expect(verse(page, 2).first()).not.toHaveAttribute("data-hl", /.*/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Backspace");
  await expect(verse(page, 3).first()).not.toHaveAttribute("data-hl", /.*/);
  await page.evaluate(() => {
    const r = document.createRange();
    const v = document.querySelector('article.chapter .v[data-v="7"]')!;
    r.setStart(v.lastChild!, 0);
    r.setEnd(v.lastChild!, 5);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await expect(toolbar(page)).toBeVisible();
  await toolbar(page).getByRole("button", { name: "Sage" }).click();
  await expect(verse(page, 7).first()).toHaveAttribute("data-hl", "sage");
});

for (const scheme of ["light", "dark"] as const) {
  test(`screenshot + axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/bsb/john/3");
    await verse(page, 16).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await pick(page, 14, 15);
    await page.keyboard.press("1");
    await pick(page, 16);
    await page.keyboard.press("3");
    await pick(page, 16);
    await expect(toolbar(page)).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations).toEqual([]);
    // The paragraph only: a whole-article element shot would stitch the sticky bar into the image.
    await expect(verse(page, 16).first().locator("xpath=ancestor::p[1]")).toHaveScreenshot(`highlights-${scheme}.png`, { maxDiffPixelRatio: 0.01 });
    await expect(toolbar(page)).toHaveScreenshot(`toolbar-${scheme}.png`, { maxDiffPixelRatio: 0.01 });
  });
}

test("Ctrl+Z undoes the last highlight changes in order", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await pick(page, 2);
  await page.keyboard.press("1");
  await pick(page, 2);
  await page.keyboard.press("4");
  await expect(verse(page, 2).first()).toHaveAttribute("data-hl", "rose");
  await page.keyboard.press("Control+z");
  await expect(verse(page, 2).first()).toHaveAttribute("data-hl", "sand");
  await expect(page.locator("#live")).toHaveText("Highlight change undone");
  await page.keyboard.press("Control+z");
  await expect(verse(page, 2).first()).not.toHaveAttribute("data-hl", /.*/);
});
