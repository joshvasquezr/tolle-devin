// P3.5 Verify: D§3.13 — a visited chapter's JSON works offline; /api/* bypasses the SW; kill switch file.
import { expect, test } from "@playwright/test";

test("visited chapter JSON is served offline by the SW; /api bypasses it", async ({ page, context }) => {
  await page.goto("/bsb/john/3");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const fromSw: string[] = [];
  page.on("response", (r) => {
    if (r.fromServiceWorker()) fromSw.push(new URL(r.url()).pathname);
  });
  expect(await page.evaluate(() => fetch("/data/bsb/john/4.json").then((r) => r.status))).toBe(200);
  await context.setOffline(true);
  const offline = await page.evaluate(() => fetch("/data/bsb/john/4.json").then((r) => r.json()).then((j) => j.chapter));
  expect(offline).toBe(4);
  expect(fromSw).toContain("/data/bsb/john/4.json");
  await context.setOffline(false);
  await page.evaluate(() => fetch("/api/v1/nothing").then((r) => r.status));
  await page.evaluate(() => fetch("/esv/john/3").then((r) => r.status).catch(() => 0));
  expect(fromSw.filter((p) => p.startsWith("/api/") || p.startsWith("/esv/"))).toEqual([]);
  const kill = await page.evaluate(() => fetch("/sw-kill.json").then((r) => r.json()));
  expect(kill).toEqual({ disabled: false });
  const names: string[] = await page.evaluate(() => caches.keys());
  expect(names.some((k) => k.startsWith("quiet-static-"))).toBe(true);
});
