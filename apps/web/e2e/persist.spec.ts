// P4.5 Verify: SPEC H3 (survives reload and browser restart), H4 (repaint on navigation and translation
// switch; second tab updates live).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";

const v = (page: Page, n: number) => page.locator(`article.chapter .v[data-v="${n}"]`).first();

async function mark(page: Page, n: number, key: string) {
  await v(page, n).locator(".vn").click();
  await page.keyboard.press(key);
  await expect(v(page, n)).toHaveAttribute("data-hl", /.+/);
}

test("survives reload; repaints on client navigation and translation switch", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await mark(page, 16, "1");
  await page.reload();
  await expect(v(page, 16)).toHaveAttribute("data-hl", "sand");
  await page.mouse.click(5, 300);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/bsb\/john\/4$/);
  await expect(page.locator("article.chapter .v[data-hl]")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/bsb\/john\/3$/);
  await expect(v(page, 16)).toHaveAttribute("data-hl", "sand");
  await page.keyboard.press("t");
  await page.getByRole("dialog", { name: "Choose a translation" }).getByRole("button", { name: /King James/ }).click();
  await expect(page).toHaveURL(/\/kjv\/john\/3$/);
  await expect(v(page, 16)).toHaveAttribute("data-hl", "sand");
});

test("second tab updates live", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/web/john/3");
  await b.goto("/web/john/3");
  await mark(a, 17, "3");
  await expect(v(b, 17)).toHaveAttribute("data-hl", "slate");
  await v(a, 17).locator(".vn").click();
  await a.keyboard.press("0");
  await expect(v(b, 17)).not.toHaveAttribute("data-hl", /.*/);
});

test("survives a browser restart (persistent profile)", async ({ baseURL, browserName }) => {
  test.skip(browserName !== "chromium", "persistent-profile restart is exercised in Chromium");
  const dir = mkdtempSync(join(tmpdir(), "quiet-profile-"));
  try {
    let ctx = await chromium.launchPersistentContext(dir, { baseURL: baseURL! });
    let page = await ctx.newPage();
    await page.goto("/bsb/psalms/23");
    await mark(page, 1, "2");
    await ctx.close();
    ctx = await chromium.launchPersistentContext(dir, { baseURL: baseURL! });
    page = await ctx.newPage();
    await page.goto("/bsb/psalms/23");
    await expect(v(page, 1)).toHaveAttribute("data-hl", "sage");
    await ctx.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
