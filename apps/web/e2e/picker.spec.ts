// P2.4 Verify: SPEC N1–N7 keyboard path B → rom → Enter → 8 → Enter; mouse path; no requests on open.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("keyboard-only: B → rom → Enter → 8 → Enter", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("b");
  const panel = page.getByRole("dialog", { name: "Choose a book and chapter" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("button", { name: "John", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "John", exact: true })).toHaveAttribute("aria-current", "true");
  await page.keyboard.type("rom");
  await expect(page.getByRole("button", { name: "Romans", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#picker-grid button")).toHaveCount(16);
  await page.waitForTimeout(750);
  await page.keyboard.type("8");
  await expect(page.getByRole("button", { name: "Romans 8", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/bsb/romans/8");
  await expect(panel).toBeHidden();
  await expect(page.locator("h1 .ch-btn")).toBeFocused();
});

test("mouse path, current marks, arrows, Backspace, Esc returns focus, no network on open", async ({ page }) => {
  await page.goto("/kjv/psalms/23");
  // Let load-time work (fonts, idle prefetch of adjacent chapters) settle; then opening must add nothing.
  await page.waitForLoadState("networkidle");
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  const heading = page.locator("h1 .ch-btn");
  await heading.click();
  const panel = page.getByRole("dialog", { name: "Choose a book and chapter" });
  await expect(panel).toBeVisible();
  expect(requests).toEqual([]);
  await expect(heading).toHaveAttribute("aria-expanded", "true");
  const r = await new AxeBuilder({ page }).include("#picker").analyze();
  expect(r.violations).toEqual([]);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Proverbs", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".pk-book:focus")).toHaveText(/./);
  await page.getByRole("button", { name: "Psalms", exact: true }).click();
  await expect(page.locator('#picker-grid button[aria-current="page"]')).toHaveText("23");
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "Psalms", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveAttribute("aria-expanded", "false");
  await heading.click();
  await page.getByRole("button", { name: "Genesis", exact: true }).click();
  await page.getByRole("button", { name: "Genesis 50", exact: true }).click();
  await expect(page).toHaveURL("/kjv/genesis/50");
});
