// SPEC R9 / D§3.10: copying verses yields clean text plus `— Ref (TR)`. Verse numbers, footnote
// markers and screen-reader-only text are dropped. ESV adds its citation through the hook (P5).
import { formatRef, type BookId } from "@tolle/core";
import { getSelectedVerses } from "./selection.ts";

/** P5 hook: extra citation text for a translation (ESV). Unused for public-domain translations. */
let citation: (tr: string) => string | null = () => null;
export function setCopyCitation(fn: (tr: string) => string | null): void {
  citation = fn;
}

function clean(node: Node): string {
  const holder = document.createElement("div");
  holder.append(node);
  for (const n of holder.querySelectorAll("sup, .sr-only, .hl-sr")) n.remove();
  for (const n of holder.querySelectorAll("p, .l, h2, h3")) n.append(" ");
  // KJV source paragraph marks (¶) are layout, not text worth pasting.
  return (holder.textContent ?? "").replace(/¶/g, " ").replace(/\s+/g, " ").trim();
}

export function copyText(text: string, ref: string, tr: string): string {
  const extra = citation(tr);
  return `"${text}" — ${ref} (${tr.toUpperCase()})${extra ? `\n${extra}` : ""}`;
}

document.addEventListener("copy", (e) => {
  const a = document.querySelector<HTMLElement>("article.chapter");
  const verses = getSelectedVerses();
  if (!a || !verses.length || !e.clipboardData) return;
  const sel = getSelection();
  let text: string;
  if (sel && !sel.isCollapsed && sel.rangeCount && a.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    text = clean(sel.getRangeAt(0).cloneContents());
  } else {
    // Verse-number / keyboard selection: copy the whole selected verses.
    const set = new Set(verses);
    const frag = document.createDocumentFragment();
    for (const s of a.querySelectorAll<HTMLElement>(".v[data-v]")) {
      if (set.has(Number(s.dataset.v))) frag.append(s.cloneNode(true), " ");
    }
    text = clean(frag);
  }
  if (!text) return;
  const first = verses[0]!;
  const last = verses[verses.length - 1]!;
  const ref = formatRef({ book: a.dataset.book as BookId, chapter: Number(a.dataset.ch), vStart: first, ...(last !== first ? { vEnd: last } : {}) });
  e.clipboardData.setData("text/plain", copyText(text, ref, a.dataset.tr ?? ""));
  e.preventDefault();
});
