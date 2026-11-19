// P2.3 Verify: SPEC §5.3 examples through the bar, P3–P7, Esc, Cmd/Ctrl+Enter, axe.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const cases: [string, string][] = [
  ["jn 3", "/bsb/john/3"], ["John 3", "/bsb/john/3"], ["john3", "/bsb/john/3"], ["Jn.3", "/bsb/john/3"],
  ["romans 8:28", "/bsb/romans/8/28"], ["rom 8 28", "/bsb/romans/8/28"], ["Rom8.28", "/bsb/romans/8/28"],
  ["1 cor 13:4-7", "/bsb/1-corinthians/13/4-7"], ["1cor13:4-7", "/bsb/1-corinthians/13/4-7"],
  ["I Cor 13:4–7", "/bsb/1-corinthians/13/4-7"], ["first corinthians 13.4-7", "/bsb/1-corinthians/13/4-7"],
  ["ps 23", "/bsb/psalms/23"], ["psalm 23", "/bsb/psalms/23"], ["psalms 23", "/bsb/psalms/23"], ["pslm 23", "/bsb/psalms/23"],
  ["gen", "/bsb/genesis/1"], ["matt 5:3-12; 6:9", "/bsb/matthew/5/3-12"], ["jude 5", "/bsb/jude/1/5"],
  ["obadiah 3", "/bsb/obadiah/1/3"], ["ps 23:1-", "/bsb/psalms/23/1"], ["john 3:16-", "/bsb/john/3/16"],
];

test("every SPEC §5.3 example navigates via the bar", async ({ page }) => {
  await page.goto("/bsb/john/1");
  const bar = page.getByRole("combobox", { name: "Go to reference or search" });
  for (const [input, url] of cases) {
    await page.keyboard.press("/");
    await expect(bar).toBeFocused();
    await bar.fill(input);
    await bar.press("Enter");
    await expect(page, input).toHaveURL(url);
    // The router moves focus to the new h1 once the chapter is swapped in (D§3.8).
    await expect(page.locator("h1 .ch-btn")).toBeFocused();
  }
});

test("idle label, inline suggestion, ambiguity, invalid, Esc, search", async ({ page }) => {
  await page.goto("/kjv/romans/8");
  const bar = page.getByRole("combobox");
  await expect(bar).toHaveValue("Romans 8");
  await bar.click();
  expect(await bar.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 8]);
  await bar.fill("rom 8:2");
  await expect(page.locator("#refbar-hint")).toHaveText("");
  await bar.fill("ph");
  const opts = page.getByRole("option");
  await expect(opts).toHaveCount(2);
  expect(await opts.count()).toBeLessThanOrEqual(3);
  await expect(bar).toHaveAttribute("aria-expanded", "true");
  await bar.press("ArrowDown");
  await expect(opts.nth(1)).toHaveAttribute("aria-selected", "true");
  await bar.press("Escape");
  await expect(bar).toHaveValue("Romans 8");
  await expect(bar).not.toBeFocused();

  await bar.click();
  await bar.fill("Genesis 99");
  await expect(page.locator("#refbar-msg")).toContainText("Genesis has 50 chapters");
  await page.getByRole("button", { name: "Go to Genesis 50" }).click();
  await expect(page).toHaveURL("/kjv/genesis/50");

  await bar.click();
  await bar.fill("grace");
  await bar.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=grace&t=kjv$/);
});

test("Cmd/Ctrl+Enter forces search; prev/next beside the bar; axe clean", async ({ page }) => {
  await page.goto("/web/genesis/1");
  await expect(page.locator("#bar-prev")).toHaveAttribute("aria-disabled", "true");
  await page.locator("#bar-next").click();
  await expect(page).toHaveURL("/web/genesis/2");
  await expect(page.getByRole("combobox")).toHaveValue("Genesis 2");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations).toEqual([]);
  const bar = page.getByRole("combobox");
  await bar.click();
  await bar.fill("john 3");
  await bar.press("ControlOrMeta+Enter");
  await expect(page).toHaveURL(/\/search\?q=john%203&t=web$/);
});
