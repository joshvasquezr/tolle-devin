// D§3.5 picker: Popover API panel, roving focus, type-ahead, chapter grid; navigation through the router.
import { PD_TRANSLATIONS, formatPath, getBook, parseInput, type BookId, type Translation } from "@tolle/core";

const panel = document.getElementById("picker") as HTMLElement | null;
const booksView = document.getElementById("picker-books")!;
const chView = document.getElementById("picker-chapters")!;
const grid = document.getElementById("picker-grid")!;
const title = document.getElementById("picker-book")!;
const back = document.getElementById("picker-back")!;
const bookBtns = [...document.querySelectorAll<HTMLButtonElement>(".pk-book")];
const columns = [bookBtns.filter((b) => getBook(b.dataset.book as BookId).testament === "ot"), bookBtns.filter((b) => getBook(b.dataset.book as BookId).testament === "nt")];

const current = () => {
  const a = document.querySelector<HTMLElement>("article.chapter");
  const tr = a?.dataset.tr && (PD_TRANSLATIONS as readonly string[]).includes(a.dataset.tr) ? (a.dataset.tr as Translation) : "bsb";
  return { tr, book: a?.dataset.book as BookId | undefined, chapter: Number(a?.dataset.ch ?? 0) };
};
const trigger = () => document.querySelector<HTMLButtonElement>("#main h1 .ch-btn");

let buffer = "";
let bufferTimer: ReturnType<typeof setTimeout> | undefined;

function roving(list: HTMLButtonElement[], target: HTMLButtonElement): void {
  for (const b of list) b.tabIndex = b === target ? 0 : -1;
  target.focus();
}

function showBooks(focusBook?: BookId): void {
  chView.hidden = true;
  booksView.hidden = false;
  const cur = current();
  for (const b of bookBtns) b.setAttribute("aria-current", String(b.dataset.book === cur.book));
  roving(bookBtns, bookBtns.find((b) => b.dataset.book === (focusBook ?? cur.book)) ?? bookBtns[0]!);
}

function showChapters(book: BookId): void {
  const b = getBook(book);
  const cur = current();
  title.textContent = b.name;
  grid.replaceChildren(
    ...Array.from({ length: b.chapters }, (_, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(i + 1);
      btn.dataset.ch = String(i + 1);
      btn.tabIndex = -1;
      btn.setAttribute("aria-label", `${b.name} ${i + 1}`);
      if (book === cur.book && i + 1 === cur.chapter) btn.setAttribute("aria-current", "page");
      return btn;
    }),
  );
  grid.dataset.book = book;
  booksView.hidden = true;
  chView.hidden = false;
  const btns = [...grid.querySelectorAll("button")];
  roving(btns, btns.find((x) => x.getAttribute("aria-current") === "page") ?? btns[0]!);
}

function select(book: BookId, chapter: number): void {
  panel!.hidePopover();
  dispatchEvent(new CustomEvent("quiet:navigate", { detail: { url: formatPath(current().tr, { book, chapter }) } }));
}

export function openPicker(): void {
  if (!panel || panel.matches(":popover-open")) return;
  panel.showPopover();
  trigger()?.setAttribute("aria-expanded", "true");
  showBooks();
}

function typeAhead(key: string): void {
  clearTimeout(bufferTimer);
  buffer += key.toLowerCase();
  bufferTimer = setTimeout(() => (buffer = ""), 700);
  if (!chView.hidden) {
    const btn = grid.querySelector<HTMLButtonElement>(`button[data-ch="${CSS.escape(buffer)}"]`);
    if (btn) roving([...grid.querySelectorAll("button")], btn);
    return;
  }
  const r = parseInput(buffer);
  const book = r.kind === "ref" ? r.ref.book : r.kind === "ambiguous" ? r.candidates[0]?.book : undefined;
  const btn = book && bookBtns.find((b) => b.dataset.book === book);
  if (btn) roving(bookBtns, btn);
}

function arrowBooks(key: string, from: HTMLButtonElement): void {
  const c = columns[0]!.includes(from) ? 0 : 1;
  const col = columns[c]!;
  const i = col.indexOf(from);
  let next: HTMLButtonElement | undefined;
  if (key === "ArrowDown") next = col[i + 1];
  else if (key === "ArrowUp") next = col[i - 1];
  else if (key === "ArrowRight" && c === 0) next = columns[1]![Math.min(i, columns[1]!.length - 1)];
  else if (key === "ArrowLeft" && c === 1) next = columns[0]![i];
  if (next) roving(bookBtns, next);
}

function arrowGrid(key: string, from: HTMLButtonElement): void {
  const btns = [...grid.querySelectorAll<HTMLButtonElement>("button")];
  const i = btns.indexOf(from);
  if (key === "ArrowLeft" && i % 6 === 0) return showBooks(grid.dataset.book as BookId);
  const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[key] ?? 0;
  const next = btns[i + d];
  if (next) roving(btns, next);
}

if (panel) {
  document.addEventListener("click", (e) => {
    if ((e.target as Element).closest?.("#main h1 .ch-btn")) openPicker();
  });
  panel.addEventListener("toggle", (e) => {
    if ((e as ToggleEvent).newState === "closed") {
      const t = trigger();
      t?.setAttribute("aria-expanded", "false");
      // N1: focus returns to the heading (router focuses the new heading after a selection).
      if (panel.contains(document.activeElement) || document.activeElement === document.body) t?.focus();
    }
  });
  booksView.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>(".pk-book");
    if (b) showChapters(b.dataset.book as BookId);
  });
  grid.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-ch]");
    if (b) select(grid.dataset.book as BookId, Number(b.dataset.ch));
  });
  back.addEventListener("click", () => showBooks(grid.dataset.book as BookId));
  panel.addEventListener("keydown", (e) => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLButtonElement;
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (t.classList.contains("pk-book")) arrowBooks(e.key, t);
      else if (t.dataset.ch) arrowGrid(e.key, t);
    } else if (e.key === "Backspace" && !chView.hidden) {
      e.preventDefault();
      showBooks(grid.dataset.book as BookId);
    } else if (e.key.length === 1 && /[\p{L}\p{N} ]/u.test(e.key) && !(e.key === " " && !buffer)) {
      e.preventDefault();
      typeAhead(e.key);
    }
  });
  // SPEC §6.9 "B" opens the picker (P2.5 moves this into the shared dispatcher).
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "b" || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true'], [popover]")) return;
    e.preventDefault();
    openPicker();
  });
}
