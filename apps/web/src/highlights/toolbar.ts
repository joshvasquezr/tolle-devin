// D§3.10 Toolbar (SPEC §5.5, §6.8): four tints and, when needed, remove; floats 8 px above the
// selection (below when there is no room), clamped to the viewport.
import { COLORS, type Color } from "./store.ts";
import { applyColor, colorsByVerse } from "./paint.ts";
import { clearVerseSelection, describe, getSelectedVerses } from "./selection.ts";

const NAMES: Record<Color, string> = { sand: "Sand", sage: "Sage", slate: "Slate", rose: "Rose" };
const H = 36;
const GAP = 8;

let bar: HTMLElement | null = null;

function build(): HTMLElement {
  const el = document.createElement("div");
  el.id = "hl-toolbar";
  el.className = "hl-toolbar";
  el.setAttribute("role", "toolbar");
  el.setAttribute("aria-label", "Highlight");
  for (const c of COLORS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hl-dot";
    b.dataset.color = c;
    b.title = NAMES[c];
    b.setAttribute("aria-label", NAMES[c]);
    el.append(b);
  }
  const x = document.createElement("button");
  x.type = "button";
  x.className = "hl-remove";
  x.dataset.color = "";
  x.title = "Remove highlight";
  x.setAttribute("aria-label", "Remove highlight");
  x.textContent = "×";
  el.append(x);
  // Keep the text selection alive while clicking the toolbar.
  el.addEventListener("pointerdown", (e) => e.preventDefault());
  el.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-color]");
    if (b) void highlight((b.dataset.color as Color) || null);
  });
  document.body.append(el);
  return el;
}

function selectionRect(): DOMRect | null {
  const sel = getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount) {
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width || r.height) return r;
  }
  const vs = getSelectedVerses();
  const first = document.querySelector(`article.chapter .v[data-v="${vs[0]}"]`);
  const all = document.querySelectorAll(`article.chapter .v[data-v="${vs[vs.length - 1]}"]`);
  const last = all[all.length - 1];
  if (!first || !last) return null;
  const a = first.getClientRects()[0] ?? first.getBoundingClientRect();
  const lr = last.getClientRects();
  const b = lr[lr.length - 1] ?? last.getBoundingClientRect();
  return new DOMRect(Math.min(a.left, b.left), a.top, Math.abs(b.right - a.left), b.bottom - a.top);
}

function place(el: HTMLElement): boolean {
  const r = selectionRect();
  if (!r || r.bottom < 0 || r.top > innerHeight) return false;
  const chrome = document.querySelector("header.bar:not(.chrome-hidden)")?.getBoundingClientRect().bottom ?? 0;
  const w = el.offsetWidth;
  let top = r.top - GAP - H;
  if (top < Math.max(chrome, 0) + 4) top = r.bottom + GAP;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  el.style.top = `${Math.round(Math.min(top, innerHeight - H - 8))}px`;
  el.style.left = `${Math.round(left)}px`;
  return true;
}

export function hideToolbar(): void {
  bar?.classList.remove("on");
}

async function show(): Promise<void> {
  const vs = getSelectedVerses();
  if (!vs.length) return hideToolbar();
  bar ??= build();
  const colors = await colorsByVerse();
  (bar.querySelector(".hl-remove") as HTMLElement).hidden = !vs.some((v) => colors.has(v));
  if (place(bar)) bar.classList.add("on");
  else hideToolbar();
}

/** Applies (or removes, null) a tint to the selected verses; used by the toolbar and the 1–4/0 keys. */
export async function highlight(color: Color | null): Promise<void> {
  const vs = [...getSelectedVerses()];
  if (!vs.length) return;
  await applyColor(vs, color);
  hideToolbar();
  clearVerseSelection(true);
  const live = document.getElementById("live");
  if (live) live.textContent = color ? `${describe(vs).replace(/selected$/, "highlighted")} ${NAMES[color]}` : `${describe(vs).replace(/selected$/, "")}highlight removed`;
}

addEventListener("quiet:selection", () => void show());
addEventListener("scroll", () => {
  if (bar?.classList.contains("on") && !place(bar)) hideToolbar();
}, { passive: true });
addEventListener("quiet:chapter", hideToolbar);
