// P1.5 Verify: R5 prev/next across books and edges; R6 return to last position.
import { expect, test } from "@playwright/test";

test("first visit to / shows BSB John 1", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.locator("h1")).toHaveText("John 1");
});

test("/ returns to the last chapter read", async ({ page }) => {
  await page.goto("/kjv/psalms/23");
  await page.waitForFunction(() => localStorage.getItem("quiet.pos.v1") !== null);
  await page.goto("/");
  await expect(page).toHaveURL("/kjv/psalms/23");
});

test("next from Genesis 50 is Exodus 1; edges are disabled", async ({ page }) => {
  await page.goto("/bsb/genesis/50");
  await page.getByRole("link", { name: "Exodus 1 →" }).click();
  await expect(page).toHaveURL("/bsb/exodus/1");
  await page.goto("/bsb/genesis/1");
  await expect(page.locator('a[rel="prev"]')).toHaveCount(0);
  await expect(page.getByText("← Previous")).toHaveAttribute("aria-disabled", "true");
  await page.goto("/bsb/revelation/22");
  await expect(page.locator('a[rel="next"]')).toHaveCount(0);
});
