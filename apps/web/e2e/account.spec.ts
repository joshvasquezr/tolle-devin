// P6.8 Verify: SPEC A7, A8 — account panel, sync now, export, sign out (clear device), delete flow.
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "cookie flow checked in Chromium");

const verse = (page: Page, v: number) => page.locator(`article.chapter .v[data-v="${v}"]`).first();
const uniq = () => `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function signIn(page: Page, email: string) {
  await page.goto("/bsb/john/3");
  expect((await page.request.post("/api/v1/auth/request", { data: { email } })).status()).toBe(202);
  const mail = (await (await page.request.get(`/api/v1/dev/mail?to=${encodeURIComponent(email)}`)).json()) as { text: string };
  const link = new URL(/https?:\/\/\S+#token=[0-9a-f]{64}/.exec(mail.text)![0]);
  await page.goto(link.pathname + link.hash);
  await page.waitForURL((u) => u.pathname !== "/auth/verify");
  await page.goto("/bsb/john/3");
}
async function highlight16(page: Page) {
  await verse(page, 16).scrollIntoViewIfNeeded();
  await verse(page, 16).locator(".vn").click();
  const pushed = page.waitForResponse((r) => r.url().endsWith("/api/v1/highlights/batch") && r.ok());
  await page.getByRole("toolbar", { name: "Highlight" }).getByRole("button", { name: "Sand" }).click();
  await pushed;
}
const usersWith = (email: string) =>
  JSON.parse(execFileSync("pnpm", ["--filter", "@tolle/worker", "exec", "wrangler", "d1", "execute", "tolle", "--local", "--json", "--command", `SELECT (SELECT COUNT(*) FROM users WHERE email = '${email}') AS n, (SELECT COUNT(*) FROM highlights h LEFT JOIN users u ON u.id = h.user_id WHERE u.id IS NULL) AS orphans`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/^[^[]*/, ""))[0].results[0] as { n: number; orphans: number };

test("account panel: email, last synced, sync now, export, sign out with clear device", async ({ page, context }) => {
  const email = uniq();
  await signIn(page, email);
  await highlight16(page);
  const btn = page.getByRole("button", { name: "Account" });
  await btn.click();
  const dialog = page.getByRole("dialog", { name: "Account" });
  await expect(dialog.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sync now" })).toBeFocused();
  await expect(dialog.getByRole("status")).toContainText("Last synced");
  expect((await new AxeBuilder({ page }).include("#acct-pop").analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Sync now" }).click();
  await expect(dialog.getByRole("status")).toContainText("Last synced");
  const dl = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Export data" }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe("quiet-account.json");
  const data = JSON.parse(await (await import("node:fs/promises")).readFile((await file.path())!, "utf8")) as { user: { email: string }; items: { verseId: number; color: string }[] };
  expect(data.user.email).toBe(email);
  expect(data.items).toEqual([expect.objectContaining({ verseId: 43_003_016, color: "sand" })]);
  await dialog.getByLabel("Also clear this device").check();
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  await expect(verse(page, 16)).not.toHaveAttribute("data-hl", /.*/);
  expect((await context.cookies()).find((c) => c.name === "__Host-session")).toBeUndefined();
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
});

test("delete account with one confirmation leaves no server rows; local highlights stay", async ({ page }) => {
  const email = uniq();
  await signIn(page, email);
  await highlight16(page);
  expect(usersWith(email).n).toBe(1);
  await page.getByRole("button", { name: "Account" }).click();
  const dialog = page.getByRole("dialog", { name: "Account" });
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeFocused();
  expect((await new AxeBuilder({ page }).include("#acct-pop").analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  await expect(page.locator("#live")).toHaveText("Account deleted");
  await expect(verse(page, 16)).toHaveAttribute("data-hl", "sand");
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  expect(usersWith(email)).toEqual({ n: 0, orphans: 0 });
});
