// SPEC A1, A2, A7, A8 account popover. Anonymous visitors make no account requests and get no cookies.
// Sync actions go through events so this module doesn't import the sync engine (which imports it).
import { openStore } from "../highlights/store.ts";

export const ACCOUNT_KEY = "quiet.acct";

export function openSignIn(): void {
  const btn = document.getElementById("acct-btn");
  if (btn?.getAttribute("aria-expanded") !== "true") btn?.click();
}

function init(): void {
  const btn = document.getElementById("acct-btn");
  const pop = document.getElementById("acct-pop");
  const form = document.getElementById("acct-form") as HTMLFormElement | null;
  if (!btn || !pop || !form) return;
  const email = form.querySelector<HTMLInputElement>("#acct-email")!;
  const err = form.querySelector<HTMLElement>("#acct-err")!;
  const sent = document.getElementById("acct-sent")!;
  const signed = document.getElementById("acct-in")!;
  const who = document.getElementById("acct-who")!;
  const last = document.getElementById("acct-last")!;
  const confirm = document.getElementById("acct-confirm")!;
  const isIn = () => !!localStorage.getItem(ACCOUNT_KEY);
  const showLast = async () => {
    const t = (await (await openStore()).getMeta("lastSync")) as number | undefined;
    last.textContent = t ? `Last synced ${new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "Not synced yet";
  };
  const render = () => {
    const on = isIn();
    btn.textContent = on ? "Account" : "Sign in";
    pop.setAttribute("aria-labelledby", on ? "acct-in-title" : "acct-title");
    signed.hidden = !on;
    confirm.hidden = true;
    if (on) form.hidden = sent.hidden = true;
    else if (signed.hidden && sent.hidden) form.hidden = false;
  };
  const refresh = async () => {
    void showLast();
    const r = await fetch("/api/v1/me", { credentials: "same-origin" }).catch(() => null);
    if (r?.status === 401) return void dispatchEvent(new CustomEvent("quiet:sign-out", { detail: { clear: false } }));
    if (r?.ok) who.textContent = `Signed in as ${((await r.json()) as { email: string }).email}`;
  };
  render();
  addEventListener("quiet:signed-out", () => {
    form.hidden = false;
    sent.hidden = true;
    render();
  });
  addEventListener("quiet:highlights-synced", () => void showLast());
  document.getElementById("acct-sync")!.addEventListener("click", () => {
    last.textContent = "Syncing…";
    dispatchEvent(new CustomEvent("quiet:sync-now"));
  });
  document.getElementById("acct-out")!.addEventListener("click", () => {
    const clear = (document.getElementById("acct-clear") as HTMLInputElement).checked;
    dispatchEvent(new CustomEvent("quiet:sign-out", { detail: { clear } }));
    btn.focus();
  });
  document.getElementById("acct-del")!.addEventListener("click", () => {
    confirm.hidden = false;
    document.getElementById("acct-del-yes")!.focus();
  });
  document.getElementById("acct-del-no")!.addEventListener("click", () => {
    confirm.hidden = true;
    document.getElementById("acct-del")!.focus();
  });
  document.getElementById("acct-del-yes")!.addEventListener("click", async () => {
    const r = await fetch("/api/v1/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin" }).catch(() => null);
    if (!r || (r.status !== 204 && r.status !== 401)) {
      last.textContent = "Couldn't delete the account. Try again.";
      return;
    }
    dispatchEvent(new CustomEvent("quiet:sign-out", { detail: { clear: false } }));
    const live = document.getElementById("live");
    if (live) live.textContent = "Account deleted";
    btn.focus();
  });
  const close = (focus = true) => {
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (focus) btn.focus();
  };
  btn.addEventListener("click", () => {
    if (!pop.hidden) return close();
    render();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if (isIn()) {
      void refresh();
      return void document.getElementById("acct-sync")!.focus();
    }
    (form.hidden ? sent.querySelector<HTMLElement>("h2") : email)?.focus();
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    const t = e.target as Node;
    if (!pop.hidden && !pop.contains(t) && !btn.contains(t)) close(false);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = email.value.trim();
    if (!email.checkValidity() || !value) {
      err.textContent = "Enter an email address.";
      email.focus();
      return;
    }
    err.textContent = "";
    try {
      const r = await fetch("/api/v1/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: value }) });
      if (r.status !== 202) throw new Error(String(r.status));
    } catch {
      err.textContent = "Couldn't send the link. Try again.";
      return;
    }
    document.getElementById("acct-to")!.textContent = value;
    form.hidden = true;
    sent.hidden = false;
    sent.querySelector<HTMLElement>("h2")!.focus();
  });
}

if (typeof document !== "undefined") init();
