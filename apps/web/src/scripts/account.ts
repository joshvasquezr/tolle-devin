// SPEC A1, A2 sign-in popover. Anonymous visitors make no account requests and get no cookies.
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
  const close = (focus = true) => {
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (focus) btn.focus();
  };
  btn.addEventListener("click", () => {
    if (!pop.hidden) return close();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
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
