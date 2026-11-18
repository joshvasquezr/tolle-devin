// D§3.6 keyboard dispatcher. Bindings are data; the "?" list is rendered from the same table (no drift).
import { clearVerseSelection, hasVerseSelection } from "../highlights/selection.ts";
import { openPicker } from "./picker.ts";
import { toggleTheme } from "./settings.ts";
import { openSwitcher } from "./translations.ts";

interface Binding {
  keys: string[]; // KeyboardEvent.key values
  label: string; // shown in the "?" list
  desc: string;
  /** Extra guard beyond the global rules. */
  when?: () => boolean;
  run: () => void;
}

const noSelection = () => (getSelection()?.isCollapsed ?? true) && !hasVerseSelection();
const onPage = () => {
  const a = document.activeElement;
  return !a || a === document.body || !!a.closest("article.chapter, #main");
};
const follow = (id: string) => {
  const a = document.getElementById(id) as HTMLAnchorElement | null;
  if (a?.href) a.click();
};

export const BINDINGS: Binding[] = [
  { keys: ["/"], label: "/", desc: "Go to a reference or search", run: () => document.getElementById("refbar")?.focus() },
  { keys: ["b", "B"], label: "B", desc: "Choose book and chapter", run: openPicker },
  { keys: ["ArrowLeft"], label: "←", desc: "Previous chapter", when: () => noSelection() && onPage(), run: () => follow("bar-prev") },
  { keys: ["ArrowRight"], label: "→", desc: "Next chapter", when: () => noSelection() && onPage(), run: () => follow("bar-next") },
  { keys: ["j", "J"], label: "J / K", desc: "Scroll down / up by a screen", run: () => scrollBy({ top: innerHeight * 0.9, behavior: "smooth" }) },
  { keys: ["k", "K"], label: "", desc: "", run: () => scrollBy({ top: -innerHeight * 0.9, behavior: "smooth" }) },
  { keys: ["t", "T"], label: "T", desc: "Switch translation", run: openSwitcher },
  { keys: ["d", "D"], label: "D", desc: "Toggle light / dark", run: toggleTheme },
  { keys: ["?"], label: "?", desc: "Show keyboard shortcuts", run: () => showHelp() },
  { keys: ["Escape"], label: "Esc", desc: "Close, clear selection, leave input", run: clearVerseSelection },
];

function showHelp(): void {
  let pop = document.getElementById("keys-help");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "keys-help";
    pop.setAttribute("popover", "auto");
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Keyboard shortcuts");
    const h = document.createElement("h2");
    h.textContent = "Keyboard shortcuts";
    const dl = document.createElement("dl");
    for (const b of BINDINGS.filter((x) => x.label)) {
      const dt = document.createElement("dt");
      const kbd = document.createElement("kbd");
      kbd.textContent = b.label;
      dt.append(kbd);
      const dd = document.createElement("dd");
      dd.textContent = b.desc;
      dl.append(dt, dd);
    }
    pop.append(h, dl);
    document.body.append(pop);
  }
  pop.showPopover();
  pop.tabIndex = -1;
  pop.focus();
}

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
  // An open popover owns the keyboard (its own handlers, plus native Esc).
  if (document.querySelector(":popover-open")) return;
  const b = BINDINGS.find((x) => x.keys.includes(e.key));
  if (!b || (b.when && !b.when())) return;
  e.preventDefault();
  b.run();
});
