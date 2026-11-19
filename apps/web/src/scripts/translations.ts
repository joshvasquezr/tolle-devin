// D§3.7: switch translation, keeping the chapter, focused verses and the verse at the same viewport offset.
import { formatPath, toBookId, type Ref, type Translation } from "@tolle/core";

const btn = document.getElementById("tr-btn") as HTMLButtonElement | null;
const pop = document.getElementById("tr-pop") as HTMLElement | null;

const article = () => document.querySelector<HTMLElement>("article.chapter");

function sync(): void {
  const tr = article()?.dataset.tr ?? "bsb";
  if (btn) {
    btn.textContent = tr.toUpperCase();
    btn.setAttribute("aria-label", `Translation: ${tr.toUpperCase()}`);
  }
  for (const o of pop?.querySelectorAll<HTMLElement>(".tr-opt") ?? []) o.setAttribute("aria-current", String(o.dataset.tr === tr));
}

/** The reader's place: the focused verse if it is on screen, else the verse at the viewport's middle. */
function anchor(): { v: number; offset: number } | undefined {
  const spans = [...document.querySelectorAll<HTMLElement>("article.chapter .v[data-v]")];
  const onScreen = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };
  const mid = innerHeight / 2;
  const el =
    spans.find((x) => x.classList.contains("focus") && onScreen(x)) ??
    spans.find((x) => {
      const r = x.getBoundingClientRect();
      return r.top <= mid && r.bottom >= mid;
    }) ??
    spans.find(onScreen);
  return el ? { v: Number(el.dataset.v), offset: el.getBoundingClientRect().top } : undefined;
}

export function switchTo(tr: Translation): void {
  const a = article();
  if (location.pathname === "/search") {
    // Search results switch by query parameter (SPEC T3: the translation lives in the URL).
    const u = new URL(location.href);
    u.searchParams.set("t", tr);
    u.searchParams.delete("page");
    location.assign(u.href);
    return;
  }
  if (!a?.dataset.book || !a.dataset.ch) return;
  pop?.hidePopover();
  const focus = document.getElementById("main")?.dataset.focus?.match(/^(\d+)-(\d+)$/);
  const base = { book: toBookId(a.dataset.book), chapter: Number(a.dataset.ch) };
  const ref: Ref = !focus ? base : focus[1] === focus[2] ? { ...base, vStart: Number(focus[1]) } : { ...base, vStart: Number(focus[1]), vEnd: Number(focus[2]) };
  dispatchEvent(new CustomEvent("quiet:navigate", { detail: { url: formatPath(tr, ref), anchor: anchor() } }));
}

export function openSwitcher(): void {
  if (!pop || pop.matches(":popover-open")) return;
  sync();
  pop.showPopover();
  btn?.setAttribute("aria-expanded", "true");
  (pop.querySelector<HTMLElement>('.tr-opt[aria-current="true"]') ?? pop.querySelector<HTMLElement>(".tr-opt"))?.focus();
}

if (btn && pop) {
  sync();
  addEventListener("quiet:chapter", sync);
  btn.addEventListener("click", openSwitcher);
  pop.addEventListener("toggle", (e) => {
    if ((e as ToggleEvent).newState === "closed") {
      btn.setAttribute("aria-expanded", "false");
      if (pop.contains(document.activeElement) || document.activeElement === document.body) btn.focus({ preventScroll: true });
    }
  });
  pop.addEventListener("click", (e) => {
    const o = (e.target as Element).closest<HTMLElement>(".tr-opt");
    if (o?.dataset.tr) switchTo(o.dataset.tr as Translation);
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const opts = [...pop.querySelectorAll<HTMLElement>(".tr-opt")];
    const i = opts.indexOf(document.activeElement as HTMLElement);
    opts[(i + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length]?.focus();
  });
}
