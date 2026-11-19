// D§1 D4: the magic link opens /auth/verify#token=…; the page POSTs it, so link scanners can't use it.
import { ACCOUNT_KEY, openSignIn } from "./account.ts";

async function verify(root: HTMLElement): Promise<void> {
  const title = root.querySelector("h1")!;
  const msg = root.querySelector<HTMLElement>("#verify-msg")!;
  const retry = root.querySelector<HTMLButtonElement>("#verify-retry")!;
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  history.replaceState(history.state, "", location.pathname); // keep the token out of history
  const fail = () => {
    title.textContent = "This link has expired";
    msg.textContent = "Sign-in links work once, for 15 minutes.";
    retry.hidden = false;
    retry.addEventListener("click", openSignIn);
    retry.focus();
  };
  if (!token) return fail();
  try {
    const r = await fetch("/api/v1/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, client: "web" }) });
    if (!r.ok) return fail();
  } catch {
    return fail();
  }
  localStorage.setItem(ACCOUNT_KEY, "1");
  title.textContent = "Signed in";
  location.replace("/");
}

if (typeof document !== "undefined") {
  const root = document.getElementById("verify");
  if (root) void verify(root);
}
