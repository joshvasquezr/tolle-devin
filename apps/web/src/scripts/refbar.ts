// D§3.4 reference bar: idle → focused (select all) → typing (parse on input) → submit | cancel.
import { PD_TRANSLATIONS, formatPath, formatRef, neighbors, parseInput, toBookId, type ParseResult, type Ref, type Translation } from "@tolle/core";

interface Row { label: string; url: string }

const input = document.getElementById("refbar") as HTMLInputElement | null;
const list = document.getElementById("refbar-list") as HTMLUListElement;
const hint = document.getElementById("refbar-hint")!;
const msg = document.getElementById("refbar-msg")!;
const prevBtn = document.getElementById("bar-prev") as HTMLAnchorElement;
const nextBtn = document.getElementById("bar-next") as HTMLAnchorElement;

const article = () => document.querySelector<HTMLElement>("article.chapter");
const tr = (): Translation => {
  const t = article()?.dataset.tr;
  return t && (PD_TRANSLATIONS as readonly string[]).includes(t) ? (t as Translation) : "bsb";
};
const label = () => document.title.split(" — ")[0] ?? "";
const searchUrl = (q: string) => `/search?q=${encodeURIComponent(q)}&t=${tr()}`;
const navigate = (url: string) => dispatchEvent(new CustomEvent("quiet:navigate", { detail: { url } }));

let rows: Row[] = [];
let active = 0;

function setNav(a: HTMLAnchorElement, r: Ref | null): void {
  if (r) {
    a.href = formatPath(tr(), r);
    a.removeAttribute("aria-disabled");
    a.setAttribute("aria-label", `${a.id === "bar-prev" ? "Previous" : "Next"} chapter: ${formatRef(r)}`);
  } else {
    a.removeAttribute("href");
    a.setAttribute("aria-disabled", "true");
  }
}

function syncIdle(): void {
  if (!input) return;
  input.value = label();
  const a = article();
  if (a?.dataset.book && a.dataset.ch) {
    const n = neighbors(toBookId(a.dataset.book), Number(a.dataset.ch));
    setNav(prevBtn, n.prev);
    setNav(nextBtn, n.next);
  }
}

function render(result: ParseResult | null, raw: string): void {
  msg.textContent = "";
  hint.textContent = "";
  rows = [];
  if (result?.kind === "ref") {
    rows = [{ label: result.label, url: formatPath(tr(), result.ref) }];
    // SPEC P3: one faint inline suggestion; P7: a book-like word may also be a search.
    if (!/\d/.test(raw)) rows.push({ label: `Search for “${raw.trim()}”`, url: searchUrl(raw.trim()) });
    hint.textContent = result.label.toLowerCase().startsWith(raw.toLowerCase()) ? raw + result.label.slice(raw.length) : "";
  } else if (result?.kind === "ambiguous") {
    rows = result.candidates.slice(0, 3).map((c) => ({ label: c.label, url: formatPath(tr(), c.ref) }));
  } else if (result?.kind === "invalid") {
    const s = result.suggestion;
    const name = formatRef({ book: result.book, chapter: 1 }).replace(/ 1$/, "");
    msg.innerHTML = "";
    msg.append(
      result.reason === "chapter_out_of_range" ? `${name} has ${result.max} chapters. ` : `${formatRef({ book: s.book, chapter: s.chapter })} has ${result.max} verses. `,
    );
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `Go to ${formatRef(s)}`;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => go(formatPath(tr(), s)));
    msg.append(b);
    rows = [{ label: formatRef(s), url: formatPath(tr(), s) }];
  } else if (result?.kind === "search") {
    rows = [{ label: `Search for “${result.query}”`, url: searchUrl(result.query) }];
  }
  active = 0;
  const showList = result?.kind === "ambiguous" || rows.length > 1;
  list.replaceChildren(
    ...(showList ? rows : []).map((r, i) => {
      const li = document.createElement("li");
      li.id = `refbar-opt-${i}`;
      li.setAttribute("role", "option");
      li.textContent = r.label;
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => go(r.url));
      return li;
    }),
  );
  list.hidden = !showList;
  input!.setAttribute("aria-expanded", String(showList));
  mark();
}

function mark(): void {
  for (const [i, li] of [...list.children].entries()) li.setAttribute("aria-selected", String(i === active));
  if (!list.hidden && list.children[active]) input!.setAttribute("aria-activedescendant", list.children[active]!.id);
  else input!.removeAttribute("aria-activedescendant");
}

function close(): void {
  rows = [];
  list.hidden = true;
  list.replaceChildren();
  hint.textContent = "";
  msg.textContent = "";
  input!.setAttribute("aria-expanded", "false");
  input!.removeAttribute("aria-activedescendant");
}

function go(url: string): void {
  close();
  input!.blur();
  navigate(url);
}

if (input) {
  syncIdle();
  addEventListener("quiet:chapter", syncIdle);
  input.addEventListener("focus", () => input.select());
  input.addEventListener("input", () => {
    const raw = input.value;
    if (!raw.trim()) return close();
    render(parseInput(raw), raw);
  });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      input.value = label();
      input.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) return;
      if (e.metaKey || e.ctrlKey) return go(searchUrl(raw));
      if (!rows.length) render(parseInput(raw), raw);
      const r = rows[active];
      if (r) go(r.url);
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && rows.length > 1) {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
      mark();
    }
  });
  input.addEventListener("blur", () => {
    close();
    input.value = label();
  });
  // SPEC §6.9 "/" focuses the bar (P2.5 moves this into the shared dispatcher).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable='true']")) return;
    e.preventDefault();
    input.focus();
  });
}
