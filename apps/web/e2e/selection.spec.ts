// P4.2 Verify: D§3.10 Selection / SPEC H1 — identical expectations in Chromium, Firefox and WebKit.
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __sel: number[] }).__sel = [];
    addEventListener("quiet:selection", (e) => {
      (window as unknown as { __sel: number[] }).__sel = (e as CustomEvent<{ verses: number[] }>).detail.verses;
    });
  });
});

const sel = (page: Page) => page.evaluate(() => (window as unknown as { __sel: number[] }).__sel);

/** Selects text from the start of verse a's text to verse b's text at `endAt` (chars into its last fragment). */
async function selectText(page: Page, a: number, b: number, endAt: number | "end" = "end") {
  await page.evaluate(
    ([a, b, endAt]) => {
      const text = (v: number) => {
        const frags = [...document.querySelectorAll(`article.chapter .v[data-v="${v}"]`)];
        const nodes: Text[] = [];
        for (const f of frags) {
          const w = document.createTreeWalker(f, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement?.closest(".vn") && n.textContent!.trim()) nodes.push(n as Text);
        }
        return nodes;
      };
      const start = text(a as number)[0]!;
      const endNodes = text(b as number);
      const end = endNodes[endNodes.length - 1]!;
      const r = document.createRange();
      r.setStart(start, 0);
      if (endAt === "end") r.setEnd(end, end.length);
      else r.setEnd(endNodes[0]!, endAt as number);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    },
    [a, b, endAt] as const,
  );
}

test("text selection → whole verses: single, range, multi-paragraph, boundary", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await selectText(page, 16, 16);
  await expect.poll(() => sel(page)).toEqual([16]);
  await selectText(page, 16, 18);
  await expect.poll(() => sel(page)).toEqual([16, 17, 18]);
  await selectText(page, 1, 22);
  await expect.poll(() => sel(page)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
  await selectText(page, 16, 17, 0);
  await expect.poll(() => sel(page)).toEqual([16]);
  await page.evaluate(() => getSelection()!.removeAllRanges());
  await expect.poll(() => sel(page)).toEqual([]);
});

test("mouse drag across verses selects them", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.locator('.v[data-v="16"]').first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  // Character rects, not span boxes: an inline verse spans several lines.
  const [a, b] = await page.evaluate(() => {
    const charRect = (v: string, last: boolean) => {
      const frags = [...document.querySelectorAll(`article.chapter .v[data-v="${v}"]`)];
      const nodes: Text[] = [];
      for (const f of frags) {
        const w = document.createTreeWalker(f, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement?.closest(".vn") && n.textContent!.trim()) nodes.push(n as Text);
      }
      const n = last ? nodes[nodes.length - 1]! : nodes[0]!;
      const r = document.createRange();
      const i = last ? n.length - 2 : 1;
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      const b = r.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    return [charRect("16", false), charRect("17", true)];
  });
  await page.mouse.move(a!.x, a!.y);
  await page.mouse.down();
  await page.mouse.move(b!.x, b!.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => sel(page)).toEqual([16, 17]);
});

test("poetry fragments of one verse count once", async ({ page }) => {
  await page.goto("/bsb/psalms/23");
  expect(await page.locator('.v[data-v="4"]').count()).toBeGreaterThan(1);
  await selectText(page, 4, 4);
  await expect.poll(() => sel(page)).toEqual([4]);
  await selectText(page, 3, 5);
  await expect.poll(() => sel(page)).toEqual([3, 4, 5]);
});

test("verse-number click, Shift+click, second click clears; announced", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.locator('.v[data-v="16"] .vn').click();
  await expect.poll(() => sel(page)).toEqual([16]);
  await expect(page.locator("#live")).toHaveText("Verse 16 selected");
  await page.locator('.v[data-v="18"] .vn').click({ modifiers: ["Shift"] });
  await expect.poll(() => sel(page)).toEqual([16, 17, 18]);
  await expect(page.locator("#live")).toHaveText("Verses 16 to 18 selected");
  await expect(page.locator(".v.sel")).toHaveCount(await page.locator('.v[data-v="16"], .v[data-v="17"], .v[data-v="18"]').count());
  await page.locator('.v[data-v="20"] .vn').click();
  await expect.poll(() => sel(page)).toEqual([20]);
  await page.locator('.v[data-v="20"] .vn').click();
  await expect.poll(() => sel(page)).toEqual([]);
  await expect(page.locator("#live")).toHaveText("Selection cleared");
});

test("keyboard verse cursor: arrows, Shift+arrows, Esc clears", async ({ page }) => {
  await page.goto("/bsb/john/3");
  await page.locator("article.chapter").focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => sel(page)).toEqual([1]);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => sel(page)).toEqual([2]);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => sel(page)).toEqual([2, 3, 4]);
  await expect(page.locator("#live")).toHaveText("Verses 2 to 4 selected");
  await page.keyboard.press("Shift+ArrowUp");
  await expect.poll(() => sel(page)).toEqual([2, 3]);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/bsb\/john\/3$/);
  await page.keyboard.press("Escape");
  await expect.poll(() => sel(page)).toEqual([]);
});
