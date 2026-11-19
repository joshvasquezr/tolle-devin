// P5.6 Verify: D§1 D6, D§3.8, SPEC T5 — ESV shell + client loader on John 3 and Jude, paging, verse focus,
// outage note, switcher, and no ESV text in the shell, SW cache, IndexedDB or localStorage.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const MARKER = "Zqesvmark";
test.skip(process.env.ESV_ENABLED !== "1", "ESV is only built and served with ESV_ENABLED=1");

test("John 3: noindex shell without text, then the passage renders through the shared renderer", async ({ page, request }) => {
  const shell = await request.get("/esv/john/3");
  expect(shell.status()).toBe(200);
  expect(shell.headers()["x-robots-tag"]).toBe("noindex");
  const html = await shell.text();
  expect(html).toMatch(/<meta name="robots" content="noindex"/);
  expect(html).not.toContain(MARKER);
  await page.goto("/esv/john/3");
  await expect(page.locator("article.chapter")).toHaveAttribute("data-tr", "esv");
  await expect(page.locator("article.chapter .v[data-v]")).toHaveCount(36);
  await expect(page).toHaveTitle("John 3 — English Standard Version");
  await expect(page.getByRole("button", { name: "Translation: ESV" })).toBeVisible();
  await expect(page.locator(".esv-parts")).toHaveCount(0);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations, colorScheme).toEqual([]);
  }
});

test("Jude (single-chapter book) shows whole; Haggai 2 pages between two parts", async ({ page }) => {
  await page.goto("/esv/jude/1");
  await expect(page.locator("article.chapter .v[data-v]")).toHaveCount(25);
  await page.goto("/esv/haggai/2");
  await expect(page.locator("article.chapter .v[data-v]")).toHaveCount(12);
  const parts = page.getByRole("navigation", { name: "Parts of this chapter" });
  await expect(parts.getByText("Part 1")).toHaveAttribute("aria-current", "page");
  await parts.getByRole("link", { name: "Part 2" }).click();
  await expect(page).toHaveURL("/esv/haggai/2?part=2");
  await expect(page.locator('article.chapter .v[data-v="13"]')).toHaveCount(1);
  await expect(page.locator('article.chapter .v[data-v="1"]')).toHaveCount(0);
});

test("verse URL focuses the verse; BSB → ESV switch keeps the verse", async ({ page }) => {
  await page.goto("/bsb/john/3/16");
  await page.mouse.click(5, 650);
  await page.keyboard.press("t");
  await page.getByRole("dialog", { name: "Choose a translation" }).getByRole("button", { name: /English Standard Version/ }).click();
  await expect(page).toHaveURL("/esv/john/3/16");
  await expect(page.locator(".v.focus").first()).toHaveAttribute("data-v", "16");
  await expect(page).toHaveTitle("John 3:16 — English Standard Version");
});

test("outage: note, Read in BSB link, one Try again", async ({ page }) => {
  await page.goto("/esv/obadiah/1");
  await expect(page.getByText("ESV is unavailable right now.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read this chapter in BSB" })).toHaveAttribute("href", "/bsb/obadiah/1");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("ESV is unavailable right now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("no ESV text in the SW cache, IndexedDB or localStorage; no prefetch of ESV", async ({ page }) => {
  const esvRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/esv/")) esvRequests.push(r.url());
  });
  await page.goto("/esv/john/3");
  await expect(page.locator("article.chapter .v[data-v]")).toHaveCount(36);
  await page.evaluate(() => navigator.serviceWorker?.ready.then(() => undefined));
  await page.waitForTimeout(500);
  expect(esvRequests).toHaveLength(1);
  const leaks = await page.evaluate(async (m) => {
    const hits: string[] = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const r of await c.keys()) if ((await (await c.match(r))!.text()).includes(m)) hits.push(r.url);
    }
    for (const info of await indexedDB.databases()) {
      const db = await new Promise<IDBDatabase>((ok, err) => {
        const q = indexedDB.open(info.name!);
        q.onsuccess = () => ok(q.result);
        q.onerror = () => err(q.error);
      });
      for (const s of db.objectStoreNames) {
        const all = await new Promise<unknown[]>((ok) => {
          const q = db.transaction(s).objectStore(s).getAll();
          q.onsuccess = () => ok(q.result);
        });
        if (JSON.stringify(all).includes(m)) hits.push(`idb:${info.name}/${s}`);
      }
      db.close();
    }
    if (JSON.stringify({ ...localStorage }).includes(m)) hits.push("localStorage");
    return hits;
  }, MARKER);
  expect(leaks).toEqual([]);
});

test.describe("P5.7 attribution", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });
  test("ESV pages show the label, notice, esv.org and copyright-page links; copy adds the citation", async ({ page }) => {
    await page.goto("/esv/jude/1");
    await expect(page.getByRole("button", { name: "Translation: ESV" })).toBeVisible();
    await expect(page).toHaveTitle(/English Standard Version/);
    const notice = page.locator("#esv-notice");
    await expect(notice).toContainText("Scripture quotations are from the ESV® Bible");
    await expect(notice).toContainText("The ESV may not be translated into any other language.");
    await expect(notice.getByRole("link", { name: "esv.org" })).toHaveAttribute("href", "https://www.esv.org/");
    await expect(notice.getByRole("link", { name: "ESV copyright" })).toHaveAttribute("href", "/about/esv-copyright");
    await page.evaluate(() => {
      const v = document.querySelector('article.chapter .v[data-v="3"]')!;
      const r = document.createRange();
      r.selectNodeContents(v);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await page.waitForTimeout(60);
    await page.keyboard.press("ControlOrMeta+c");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toMatch(/— Jude 3 \(ESV\)\nScripture quotations are from the ESV® Bible .* The ESV may not be translated into any other language\.$/);
    await page.getByRole("link", { name: "ESV copyright" }).click();
    await expect(page).toHaveURL("/about/esv-copyright");
    await expect(page.locator("main")).toContainText("© 2001 by Crossway");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
  test("public-domain pages carry none of the ESV attribution", async ({ page }) => {
    await page.goto("/bsb/john/3");
    await expect(page.locator("#esv-notice")).toHaveCount(0);
    await expect(page.locator('a[href="https://www.esv.org/"], a[href="/about/esv-copyright"]')).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Crossway");
  });
});

