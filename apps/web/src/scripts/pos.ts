// D§4.4: write the reading position on pagehide and after a 1 s dwell.
import { POS_KEY } from "./pos-core.ts";

const a = document.querySelector<HTMLElement>("article.chapter");
if (a?.dataset.tr && a.dataset.tr !== "esv" && location.pathname !== "/") {
  const save = () => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ tr: a.dataset.tr, book: a.dataset.book, chapter: Number(a.dataset.ch) }));
    } catch {
      // storage unavailable
    }
  };
  setTimeout(save, 1000);
  addEventListener("pagehide", save);
}
