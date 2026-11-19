// D§3.8 History-API router for public-domain chapters. ESV and other routes use normal navigation.
import { PD_TRANSLATIONS, TRANSLATION_NAMES, formatRef, getBook, neighbors, resolveRoute, formatPath, type BookId, type Chapter, type PdTranslation } from "@tolle/core";
import { chapterLabel, chapterMainHtml, chapterTitle } from "../lib/page.ts";

interface Target { tr: PdTranslation; book: BookId; chapter: number; focus?: string; label?: string }

const LIMIT = 20;
const cache = new Map<string, Promise<Chapter>>();
const isPd = (tr: string): tr is PdTranslation => (PD_TRANSLATIONS as readonly string[]).includes(tr);
const key = (t: Target) => `${t.tr}/${t.book}/${t.chapter}`;

function target(url: URL): Target | null {
  if (url.origin !== location.origin) return null;
  const r = resolveRoute(url.pathname, url.searchParams);
  if (r.kind === "chapter" && isPd(r.tr) && r.part === undefined) return { tr: r.tr, book: r.book, chapter: r.chapter };
  // SPEC R8: verse URLs render the chapter with a focus range (the Worker does the same on direct load).
  if (r.kind === "verses" && isPd(r.tr)) {
    const { book, chapter, vStart, vEnd } = r.ref;
    return { tr: r.tr, book, chapter, focus: `${vStart}-${vEnd ?? vStart}`, label: formatRef(r.ref) };
  }
  return null;
}

/** LRU of the last 20 PD chapters (D§3.8). Failed fetches are evicted so a retry can succeed. */
function load(t: Target): Promise<Chapter> {
  const k = key(t);
  let p = cache.get(k);
  if (p) cache.delete(k);
  else {
    p = fetch(`/data/${t.tr}/${getBook(t.book).slug}/${t.chapter}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Chapter>;
    });
    p.catch(() => cache.delete(k));
  }
  cache.set(k, p);
  while (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
  return p;
}

function current(): Target | null {
  return target(new URL(location.href));
}

function prefetchAdjacent(): void {
  const c = current();
  if (!c) return;
  const { prev, next } = neighbors(c.book, c.chapter);
  for (const r of [next, prev]) if (r) load({ tr: c.tr, book: r.book, chapter: r.chapter }).catch(() => {});
}

let seq = 0;

interface Anchor { v: number; offset: number }

async function go(t: Target, url: string, mode: "push" | "pop", scrollY = 0, anchor?: Anchor): Promise<void> {
  const n = ++seq;
  const startFocus = document.activeElement;
  let ch: Chapter;
  try {
    ch = await load(t);
  } catch {
    location.assign(url);
    return;
  }
  if (n !== seq) return; // a newer navigation won
  if (mode === "push") {
    history.replaceState({ ...history.state, scrollY: window.scrollY }, "");
    history.pushState({ scrollY: 0 }, "", url);
  }
  const main = document.getElementById("main")!;
  const swap = () => {
    main.innerHTML = chapterMainHtml(ch);
    if (t.focus) main.dataset.focus = t.focus;
    else delete main.dataset.focus;
    // The footer is page chrome after <main>; re-insert it as with a full page load, so it is not
    // reported as a layout shift when the chapter length changes beneath a scrolled viewport.
    const foot = document.querySelector("body > footer");
    foot?.replaceWith(foot.cloneNode(true));
    document.title = t.label ? `${t.label} — ${TRANSLATION_NAMES[t.tr]}` : chapterTitle(t.tr, t.book, t.chapter);
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", new URL(url, location.origin).href);
    // D§3.7: a translation switch keeps the same verse at the same viewport offset.
    const el = anchor && main.querySelector<HTMLElement>(`article.chapter .v[data-v="${anchor.v}"]`);
    if (el) window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - anchor.offset);
    else window.scrollTo(0, scrollY);
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !reduce) await document.startViewTransition(swap).updateCallbackDone;
  else swap();
  // Move focus to the new heading unless the reader already moved it elsewhere (e.g. "/" into the
  // reference bar) while the chapter was loading.
  const now = document.activeElement;
  if (now === startFocus || !now || now === document.body || main.contains(now)) {
    (main.querySelector<HTMLElement>("h1 .ch-btn") ?? main.querySelector<HTMLElement>("h1"))?.focus({ preventScroll: true });
  }
  document.getElementById("live")!.textContent = t.label ?? chapterLabel(t.book, t.chapter);
  dispatchEvent(new CustomEvent("quiet:chapter", { detail: { scroll: mode === "push" && !anchor } }));
  prefetchAdjacent();
}

document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || a.target || a.hasAttribute("download")) return;
  const url = new URL(a.href);
  const t = target(url);
  if (!t || url.hash) return;
  e.preventDefault();
  void go(t, url.pathname, "push");
});

// Programmatic navigation (reference bar, picker): router when possible, else a normal page load.
addEventListener("quiet:navigate", (e) => {
  const { url: raw, anchor } = (e as CustomEvent<{ url: string; anchor?: Anchor }>).detail;
  const url = new URL(raw, location.href);
  const t = target(url);
  if (t) void go(t, url.pathname, "push", 0, anchor);
  else location.assign(url.href);
});

addEventListener("popstate", (e) => {
  const t = current();
  if (!t) {
    location.reload();
    return;
  }
  void go(t, location.pathname, "pop", (e.state as { scrollY?: number } | null)?.scrollY ?? 0);
});

// Prefetch on hover/focus of prev/next, and on idle after load.
const hint = (e: Event) => {
  const a = (e.target as Element).closest?.(".chnav a") as HTMLAnchorElement | null;
  const t = a && target(new URL(a.href));
  if (t) load(t).catch(() => {});
};
document.addEventListener("pointerover", hint);
document.addEventListener("focusin", hint);
history.scrollRestoration = "manual";
if (!history.state) history.replaceState({ scrollY: window.scrollY }, "");
(window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200)))(() => prefetchAdjacent());
