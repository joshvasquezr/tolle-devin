// P1.7 Verify: sitemap 3,567 chapters; BreadcrumbList; About lists SOURCES.md; privacy < 300 words; robots.
import { expect, test } from "@playwright/test";

test("sitemap lists exactly the 3,567 PD chapter URLs", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs).toHaveLength(3567);
  expect(new Set(locs).size).toBe(3567);
  expect(locs).toContain("/kjv/song-of-solomon/8");
  expect(locs.some((p) => p.startsWith("/esv"))).toBe(false);
});

test("robots.txt points at the sitemap and excludes ESV and the API", async ({ request }) => {
  const txt = await (await request.get("/robots.txt")).text();
  expect(txt).toContain("Disallow: /esv/");
  expect(txt).toContain("Disallow: /api/");
  expect(txt).toMatch(/Sitemap: \S+\/sitemap\.xml/);
});

test("chapter pages carry a BreadcrumbList", async ({ page }) => {
  await page.goto("/web/1-corinthians/13");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld["@type"]).toBe("BreadcrumbList");
  expect(ld.itemListElement.map((i: { name: string }) => i.name)).toEqual(["Quiet Bible", "1 Corinthians", "1 Corinthians 13 — World English Bible"]);
});

test("About lists each translation with status and source; privacy is under 300 words", async ({ page }) => {
  await page.goto("/about");
  for (const name of ["Berean Standard Bible", "King James Version", "World English Bible"]) {
    await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "https://bereanbible.com/bsb_usfm.zip" })).toBeVisible();
  await page.goto("/privacy");
  const words = (await page.locator("#privacy").innerText()).split(/\s+/).filter(Boolean).length;
  expect(words).toBeLessThan(300);
});
