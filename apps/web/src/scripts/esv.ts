// P5.6 · D§1 D6, D§3.8, SPEC T5: load the ESV window for the shell's URL from the Worker and render it with
// the shared renderer. The text lives only in the DOM and `current`: never prefetched, fetched with
// cache: "no-store", and never written to the SW cache, IndexedDB or localStorage.
import { ESV_CITATION, TRANSLATION_NAMES, esvPartForVerse, formatPath, formatRef, resolveRoute, type BookId, type Chapter } from "@tolle/core";
import { escapeHtml } from "@tolle/render";
import { chapterLabel, chapterMainHtml, chapterTitle } from "../lib/page.ts";
import { setCopyCitation } from "../highlights/copy.ts";

interface Want { book: BookId; chapter: number; part: number; focus?: string; label?: string }

let current: Chapter | null = null;

function want(): Want | null {
  const r = resolveRoute(location.pathname, new URLSearchParams(location.search));
  if (r.kind === "chapter" && r.tr === "esv") return { book: r.book, chapter: r.chapter, part: r.part ?? 1 };
  if (r.kind === "verses" && r.tr === "esv") {
    const { book, chapter, vStart, vEnd } = r.ref;
    return { book, chapter, part: esvPartForVerse(book, chapter, vStart!) ?? 1, focus: `${vStart}-${vEnd ?? vStart}`, label: formatRef(r.ref) };
  }
  return null;
}

/** D§3.12 windowing: links between the parts of a chapter longer than the per-page cap. */
export function partsHtml(c: Pick<Chapter, "book" | "chapter" | "part" | "parts">): string {
  if (!c.parts || c.parts < 2) return "";
  const items = Array.from({ length: c.parts }, (_, i) => i + 1).map((p) =>
    p === c.part
      ? `<span class="btn" aria-current="page">Part ${p}</span>`
      : `<a class="btn" href="${escapeHtml(formatPath("esv", { book: c.book, chapter: c.chapter }, p))}">Part ${p}</a>`,
  );
  return `<nav class="esv-parts" aria-label="Parts of this chapter">${items.join("")}</nav>`;
}

/** P5.7 · SPEC §8.1 attribution: one quiet line below the chapter with the notice, esv.org and the copyright page. */
export function noticeHtml(): string {
  return `<p class="esv-notice" id="esv-notice">${escapeHtml(ESV_CITATION)} <a href="https://www.esv.org/">esv.org</a> · <a href="/about/esv-copyright">ESV copyright</a></p>`;
}

async function load(root: HTMLElement, w: Want, retry: boolean): Promise<void> {
  const main = document.getElementById("main")!;
  root.setAttribute("aria-busy", "true");
  const skeleton = setTimeout(() => root.classList.add("esv-wait"), 200);
  let res: Response | undefined;
  try {
    res = await fetch(`/api/v1/esv/passage?book=${w.book}&chapter=${w.chapter}&part=${w.part}`, { cache: "no-store", credentials: "omit" });
  } catch {
    res = undefined;
  }
  clearTimeout(skeleton);
  if (!res?.ok) return fail(root, w, retry);
  const body = (await res.json()) as Required<Pick<Chapter, "book" | "chapter" | "blocks" | "range" | "parts" | "part">>;
  current = { tr: "esv", book: body.book, chapter: body.chapter, blocks: body.blocks, range: body.range, parts: body.parts, part: body.part };
  main.innerHTML = chapterMainHtml(current) + partsHtml(current) + noticeHtml();
  if (w.focus) main.dataset.focus = w.focus;
  else delete main.dataset.focus;
  document.title = w.label ? `${w.label} — ${TRANSLATION_NAMES.esv}` : chapterTitle("esv", w.book, w.chapter);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", new URL(formatPath("esv", { book: w.book, chapter: w.chapter }, w.part), location.origin).href);
  document.getElementById("live")!.textContent = w.label ?? chapterLabel(w.book, w.chapter);
  dispatchEvent(new CustomEvent("quiet:chapter", { detail: { scroll: Boolean(w.focus) } }));
}

/** D§3.12 client behaviour on error: a note, a BSB link, and one manual "Try again" (no retry loop). */
function fail(root: HTMLElement, w: Want, retried: boolean): void {
  root.classList.remove("esv-wait");
  root.removeAttribute("aria-busy");
  const bsb = formatPath("bsb", { book: w.book, chapter: w.chapter });
  root.innerHTML =
    `<h1 class="ch" tabindex="-1">${escapeHtml(w.label ?? chapterLabel(w.book, w.chapter))}</h1>` +
    `<p class="esv-note" role="status">ESV is unavailable right now.</p>` +
    `<p class="esv-actions"><a class="btn" href="${escapeHtml(bsb)}">Read this chapter in BSB</a>` +
    (retried ? "" : ` <button type="button" class="btn" id="esv-retry">Try again</button>`) +
    `</p>`;
  root.querySelector("#esv-retry")?.addEventListener("click", () => void load(root, w, true));
}

const root = document.getElementById("esv-root");
const w = root && want();
if (root && w) {
  // SPEC §8.1 clipboard: copied ESV text carries Crossway's citation.
  setCopyCitation((tr) => (tr === "esv" ? ESV_CITATION : null));
  void load(root, w, false);
}
