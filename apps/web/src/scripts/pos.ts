// D§4.4: write the reading position on pagehide and after a 1 s dwell (also after router navigations).
import { POS_KEY } from "./pos-core.ts";

let timer: ReturnType<typeof setTimeout> | undefined;

function save(): void {
  const a = document.querySelector<HTMLElement>("article.chapter");
  if (!a?.dataset.tr || a.dataset.tr === "esv" || location.pathname === "/") return;
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ tr: a.dataset.tr, book: a.dataset.book, chapter: Number(a.dataset.ch) }));
  } catch {
    // storage unavailable
  }
}

function arm(): void {
  clearTimeout(timer);
  timer = setTimeout(save, 1000);
}

arm();
addEventListener("pagehide", save);
addEventListener("quiet:chapter", arm);
