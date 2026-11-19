// P2.5 Verify: SPEC §6.9 shortcuts; ignored in inputs, during IME composition and while a popover is open.
import { expect, test } from "@playwright/test";

test("shortcuts on the page body", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL("/bsb/john/4");
  await expect(page.locator("h1 .ch-btn")).toBeFocused();
  await expect(page.locator("h1 .ch-btn")).toHaveText("John 4");
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL("/bsb/john/3");
  // Wait for the router to finish (focus lands on the new heading) before the next key.
  await expect(page.locator("h1 .ch-btn")).toHaveText("John 3");
  await expect(page.locator("h1 .ch-btn")).toBeFocused();
  const before = await page.locator("html").getAttribute("data-theme");
  await page.keyboard.press("d");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", before ?? "");
  await page.keyboard.press("/");
  await expect(page.getByRole("combobox")).toBeFocused();
});

test("matrix: input focused vs body vs popover open; IME composition", async ({ page }) => {
  await page.goto("/bsb/john/3");
  // Focused input: keys type text, no navigation.
  await page.getByRole("combobox").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("bd");
  await expect(page).toHaveURL("/bsb/john/3");
  await expect(page.getByRole("dialog", { name: "Choose a book and chapter" })).toBeHidden();
  await page.keyboard.press("Escape");
  // Popover open: B/→ do not act globally.
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();
  for (const k of ["/", "B", "←", "→", "D", "?", "Esc"]) await expect(help.locator("kbd", { hasText: k }).first()).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("b");
  await expect(page).toHaveURL("/bsb/john/3");
  await expect(page.getByRole("dialog", { name: "Choose a book and chapter" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  // IME composition: ignored.
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "b", isComposing: true, bubbles: true })));
  await expect(page.getByRole("dialog", { name: "Choose a book and chapter" })).toBeHidden();
  // Modifier combos stay with the browser.
  await page.keyboard.press("Control+ArrowRight");
  await expect(page).toHaveURL("/bsb/john/3");
  await page.keyboard.press("b");
  await expect(page.getByRole("dialog", { name: "Choose a book and chapter" })).toBeVisible();
});

test("pressing / while a chapter loads keeps focus in the bar", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.route("**/data/bsb/john/4.json", async (r) => {
    await new Promise((res) => setTimeout(res, 400));
    await r.continue();
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("/");
  await expect(page).toHaveURL("/bsb/john/4");
  await expect(page.locator("h1 .ch-btn")).toHaveText("John 4");
  await expect(page.getByRole("combobox")).toBeFocused();
});
