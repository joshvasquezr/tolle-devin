// P4.7 Verify: SPEC H8 — export downloads quiet-highlights.json; import merges and reports a count.
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("export download, import upload with LWW count", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.locator('article.chapter .v[data-v="16"] .vn').first().click();
  await page.keyboard.press("1");
  await page.getByRole("button", { name: "Reading settings" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export highlights" }).click()]);
  expect(dl.suggestedFilename()).toBe("quiet-highlights.json");
  const file = JSON.parse(readFileSync((await dl.path())!, "utf8"));
  expect(file.version).toBe(1);
  expect(file.items).toHaveLength(1);
  expect(file.items[0]).toMatchObject({ verseId: 43003016, color: "sand" });
  await expect(page.getByRole("status").filter({ hasText: "Exported 1 highlight." })).toBeVisible();
  const r = await new AxeBuilder({ page }).include("#aa-pop").analyze();
  expect(r.violations).toEqual([]);

  const upload = { version: 1, items: [file.items[0], { verseId: 43003017, color: "rose", updatedAt: Date.now() + 1000 }] };
  await page.locator("#hl-file").setInputFiles({ name: "h.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(upload)) });
  await expect(page.locator("#hl-status")).toHaveText("Imported 1 highlight (1 already up to date).");
  await expect(page.locator('article.chapter .v[data-v="17"]').first()).toHaveAttribute("data-hl", "rose");
  await page.locator("#hl-file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("nope") });
  await expect(page.locator("#hl-status")).toHaveText("That file could not be imported.");
});
