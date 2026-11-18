// D§3.8 History-API router for public-domain chapters. ESV and other routes use normal navigation.
import { PD_TRANSLATIONS, getBook, neighbors, resolveRoute, formatPath, type BookId, type Chapter, type PdTranslation } from "@tolle/core";
import { chapterLabel, chapterMainHtml, chapterTitle } from "../lib/page.ts";

interface Target { tr: PdTranslation; book: BookId; chapter: number }

const LIMIT = 20;
const cache = new Map<string, Promise<Chapter>>();
const isPd = (tr: string): tr is PdTranslation => (PD_TRANSLATIONS as readonly string[]).includes(tr);
const key = (t: Target) => `${t.tr}/${t.book}/${t.chapter}`;

function target(url: URL): Target | null {
  if (url.origin !== location.origin) return null;
  const r = resolveRoute(url.pathname, url.searchParams);
  if (r.kind === "chapter" && isPd(r.tr) && r.part === undefined) return { tr: r.tr, book: r.book, chapter: r.chapter };
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

async function go(t: Target, url: string, mode: "push" | "pop", scrollY = 0): Promise<void> {
  const n = ++seq;
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
    document.title = chapterTitle(t.tr, t.book, t.chapter);
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", new URL(formatPath(t.tr, t), location.origin).href);
    window.scrollTo(0, scrollY);
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !reduce) await document.startViewTransition(swap).updateCallbackDone;
  else swap();
  main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  document.getElementById("live")!.textContent = chapterLabel(t.book, t.chapter);
  dispatchEvent(new Event("quiet:chapter"));
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
