// P2.7 Verify: D§3.9 bar hides on scroll down, returns on scroll up / top-edge hover / focus; setting off.
import { expect, test } from "@playwright/test";

const hidden = (page: import("@playwright/test").Page) => page.locator("header.bar.chrome-hidden");

test("scroll down hides, scroll up / top edge / keyboard focus reveal", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("/bsb/psalms/119");
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 1200);
  await expect(hidden(page)).toHaveCount(1);
  await expect(page.locator("header.bar")).toHaveClass(/scrolled/);
  await page.mouse.wheel(0, -200);
  await expect(hidden(page)).toHaveCount(0);
  await page.mouse.wheel(0, 1200);
  await expect(hidden(page)).toHaveCount(1);
  await page.mouse.move(600, 20);
  await expect(hidden(page)).toHaveCount(0);
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 1200);
  await expect(hidden(page)).toHaveCount(1);
  await page.keyboard.press("/");
  await expect(hidden(page)).toHaveCount(0);
  await expect(page.getByRole("combobox")).toBeFocused();
  const box = (await page.getByRole("combobox").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
});

test("Tab into the bar from a scrolled page reveals it (focus not obscured)", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("/bsb/psalms/119");
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 1500);
  await expect(hidden(page)).toHaveCount(1);
  await page.locator("#bar-prev").focus();
  await expect(hidden(page)).toHaveCount(0);
});

test("auto-hide off in settings keeps the bar", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("quiet.settings.v1", JSON.stringify({ autohide: false })));
  await page.goto("/bsb/psalms/119");
  await page.mouse.move(600, 400);
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(300);
  await expect(hidden(page)).toHaveCount(0);
  await expect(page.locator("header.bar")).toBeInViewport();
});
