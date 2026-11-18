// P2.2 Verify: SPEC R8 focus range on direct load and client navigation; not a highlight.
import { expect, test } from "@playwright/test";

test("direct load of /bsb/1-corinthians/13/4-7 marks and centers verses 4–7", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("/bsb/1-corinthians/13/4-7");
  await expect(page).toHaveTitle("1 Corinthians 13:4–7 — Berean Standard Bible");
  const marked = page.locator(".v.focus");
  expect(await marked.evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLElement).dataset.v))])).toEqual(["4", "5", "6", "7"]);
  const box = (await marked.first().boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - 350)).toBeLessThan(120);
  await expect(page.locator("[data-hl]")).toHaveCount(0);
});

test("client navigation to a verse URL focuses it; chapter links clear it", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "/bsb/john/3/16";
    a.textContent = "John 3:16";
    a.id = "jump";
    document.querySelector("article")!.prepend(a);
  });
  await page.click("#jump");
  await expect(page).toHaveURL("/bsb/john/3/16");
  await expect(page.locator(".v.focus")).toHaveAttribute("data-v", "16");
  await expect(page.locator("#live")).toHaveText("John 3:16");
  await page.locator('a[rel="next"]').click();
  await expect(page.locator("h1")).toHaveText("John 4");
  await expect(page.locator(".v.focus")).toHaveCount(0);
});
