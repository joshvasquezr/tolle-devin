// P6.6 Verify: SPEC A1, A2; D§1 D4 — sign-in popover, mail sink, verify page, expired state, axe.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.skip(({ browserName }) => browserName !== "chromium", "cookie flow checked in Chromium");

test("sign in by magic link sets the session cookie", async ({ page, context }) => {
  await page.goto("/bsb/john/3");
  expect(await context.cookies()).toEqual([]); // anonymous: no cookies
  const btn = page.getByRole("button", { name: "Sign in" });
  await btn.click();
  const dialog = page.getByRole("dialog", { name: "Sign in to sync highlights" });
  await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).include("#acct-pop").analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Email me a link" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter an email address.");
  await dialog.getByLabel("Email").fill("reader@example.com");
  await dialog.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeFocused();
  await expect(dialog).toContainText("reader@example.com");
  const mail = (await (await page.request.get("/api/v1/dev/mail?to=reader@example.com")).json()) as { to: string; text: string };
  expect(mail.to).toBe("reader@example.com");
  const link = /https?:\/\/\S+\/auth\/verify#token=[0-9a-f]{64}/.exec(mail.text)![0];
  await page.keyboard.press("Escape");
  await expect(btn).toBeFocused();
  await page.goto(new URL(link).pathname + new URL(link).hash);
  await page.waitForURL((u) => u.pathname !== "/auth/verify");
  const cookie = (await context.cookies()).find((c) => c.name === "__Host-session")!;
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  expect(await (await page.request.get("/api/v1/me")).json()).toMatchObject({ email: "reader@example.com" });
  // The link is single use.
  await page.goto(new URL(link).pathname + new URL(link).hash);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link has expired");
});

test("expired link shows one button that reopens sign-in; page is noindex and axe-clean", async ({ page }) => {
  await page.goto(`/auth/verify#token=${"0".repeat(64)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link has expired");
  expect(page.url()).not.toContain("token");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  const retry = page.getByRole("button", { name: "Send a new link" });
  await expect(retry).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await retry.click();
  await expect(page.getByRole("dialog", { name: "Sign in to sync highlights" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();
});
