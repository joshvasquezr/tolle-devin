// D§3.3: the only code that produces Scripture HTML. Runs at build time and in the browser.
import type { Block, Chapter, Item } from "@tolle/core";

export interface RenderOptions {
  /** Render footnote markers and the notes list (R4). Default true. */
  readonly notes?: boolean;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/**
 * Renders a run of items. A verse that continues from an earlier block opens a
 * new fragment with the same data-v and no number (D§3.2 multi-fragment verses).
 */
function renderItems(items: readonly Item[], state: { v: number }, opts: Required<RenderOptions>): string {
  let out = "";
  let open = false;
  const openSpan = (num: boolean) => {
    if (open) out += "</span>";
    out += `<span class="v" data-v="${state.v}">`;
    if (num) out += `<sup class="vn">${state.v}</sup>`;
    open = true;
  };
  if (state.v > 0) openSpan(false);
  for (const it of items) {
    if (typeof it === "string") out += escapeHtml(it);
    else if ("v" in it) {
      state.v = it.v;
      openSpan(true);
    } else if ("nd" in it) out += `<span class="nd">${escapeHtml(it.nd)}</span>`;
    else if (opts.notes) {
      const n = it.fn + 1;
      out += `<sup class="fn"><a href="#fn${n}" id="fnr${n}" aria-label="Footnote ${n}">${n}</a></sup>`;
    }
  }
  if (open) out += "</span>";
  return out;
}

function renderBlock(b: Block, state: { v: number }, opts: Required<RenderOptions>): string {
  switch (b.t) {
    case "h":
      return `<h2 class="sec">${escapeHtml(b.text)}</h2>`;
    case "d":
      return `<p class="d">${renderItems(b.items, state, opts)}</p>`;
    case "p":
      return `<p>${renderItems(b.items, state, opts)}</p>`;
    case "q":
      return `<div class="poetry">${b.lines
        .map((l) => `<p class="${l.i ? `l i${l.i}` : "l"}">${renderItems(l.items, state, opts)}</p>`)
        .join("")}</div>`;
  }
}

/** Article HTML for a chapter. All text is escaped; numbers come from typed fields. */
export function renderChapter(chapter: Chapter, options: RenderOptions = {}): string {
  const opts: Required<RenderOptions> = { notes: options.notes ?? true };
  const state = { v: 0 };
  const body = chapter.blocks.map((b) => renderBlock(b, state, opts)).join("\n");
  const notes =
    opts.notes && chapter.notes?.length
      ? `\n<section class="notes" aria-label="Footnotes"><ol>${chapter.notes
          .map((n, i) => `<li id="fn${i + 1}">${escapeHtml(n)} <a href="#fnr${i + 1}" aria-label="Back to text">↩</a></li>`)
          .join("")}</ol></section>`
      : "";
  return (
    `<article class="chapter" lang="en" data-tr="${escapeHtml(chapter.tr)}" data-book="${escapeHtml(chapter.book)}" data-ch="${chapter.chapter}">\n` +
    `${body}${notes}\n</article>`
  );
}
