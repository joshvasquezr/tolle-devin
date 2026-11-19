// P4.6 Verify: SPEC R9 — clean copied text plus "— Ref (TR)"; verse numbers and footnote markers excluded.
import { expect, test, type Page } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const clip = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

async function selectVerses(page: Page, a: number, b: number) {
  await page.evaluate(([a, b]) => {
    const first = document.querySelector(`article.chapter .v[data-v="${a}"]`)!;
    const all = document.querySelectorAll(`article.chapter .v[data-v="${b}"]`);
    const r = document.createRange();
    r.setStartBefore(first);
    r.setEndAfter(all[all.length - 1]!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  }, [a, b]);
  await expect.poll(() => page.evaluate(() => getSelection()!.toString().length)).toBeGreaterThan(0);
  await page.waitForTimeout(60);
}

test("copying one verse: clean text, no numbers or footnote markers, reference", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await selectVerses(page, 16, 16);
  await page.keyboard.press("ControlOrMeta+c");
  const text = await clip(page);
  expect(text).toMatch(/^"For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life\." — John 3:16 \(BSB\)$/);
});

test("copying a range across a paragraph; verse-number selection copies whole verses", async ({ page }) => {
  await page.goto("/kjv/john/3");
  await selectVerses(page, 16, 17);
  await page.keyboard.press("ControlOrMeta+c");
  const text = await clip(page);
  expect(text).toMatch(/^"For God so loved .* through him might be saved\." — John 3:16–17 \(KJV\)$/);
  expect(text).not.toMatch(/\d{2}For|17For|\s17\s/);
  await page.evaluate(() => getSelection()!.removeAllRanges());
  await page.locator('article.chapter .v[data-v="1"] .vn').first().click();
  await page.keyboard.press("ControlOrMeta+c");
  expect(await clip(page)).toMatch(/^"In the beginning was the Word.*" — John 1:1 \(KJV\)$|^"There was a man of the Pharisees.*" — John 3:1 \(KJV\)$/);
});
