// D§3.10 Selection (SPEC H1): text selection, verse-number clicks and a keyboard verse cursor all
// produce one set of whole verses (local verse numbers of the current article), broadcast as
// "quiet:selection". The .vn path does not depend on text selection (risk 7).
export type VerseSelection = readonly number[];

let selected: number[] = [];
let anchor: number | null = null;
let cursor: number | null = null;
let source: "text" | "verse" = "text";

const article = () => document.querySelector<HTMLElement>("article.chapter");
const spans = (a: HTMLElement) => [...a.querySelectorAll<HTMLElement>(".v[data-v]")];
const order = (a: HTMLElement) => [...new Set(spans(a).map((s) => Number(s.dataset.v)))];

export const getSelectedVerses = (): VerseSelection => selected;
export const hasVerseSelection = (): boolean => selected.length > 0;

function announce(msg: string): void {
  const live = document.getElementById("live");
  if (live) live.textContent = msg;
}

export function describe(vs: VerseSelection): string {
  if (!vs.length) return "Selection cleared";
  return vs.length === 1 ? `Verse ${vs[0]} selected` : `Verses ${vs[0]} to ${vs[vs.length - 1]} selected`;
}

function set(next: number[], from: "text" | "verse", speak: boolean): void {
  const same = next.length === selected.length && next.every((v, i) => v === selected[i]);
  source = from;
  if (same) return;
  selected = next;
  const a = article();
  if (a) {
    const on = new Set(from === "verse" ? next : []);
    for (const s of spans(a)) s.classList.toggle("sel", on.has(Number(s.dataset.v)));
  }
  if (speak) announce(describe(next));
  dispatchEvent(new CustomEvent("quiet:selection", { detail: { verses: next } }));
}

/** Inclusive run of verses between a and b in document order. */
function between(a: HTMLElement, x: number, y: number): number[] {
  const all = order(a);
  const [i, j] = [all.indexOf(x), all.indexOf(y)].sort((p, q) => p - q) as [number, number];
  return i < 0 ? [] : all.slice(i, j + 1);
}

export function selectVerses(vs: number[], speak = true): void {
  getSelection()?.removeAllRanges();
  anchor = vs[0] ?? null;
  cursor = vs[vs.length - 1] ?? null;
  set(vs, "verse", speak);
}

/** keepCursor: after applying a tint, arrows continue from the same verse. */
export function clearVerseSelection(keepCursor = false): void {
  getSelection()?.removeAllRanges();
  anchor = null;
  if (!keepCursor) cursor = null;
  set([], "verse", true);
}

/** Verses whose own text the current selection covers (boundary-only touches are ignored). */
export function versesFromRange(a: HTMLElement, range: Range): number[] {
  const hit = new Set<number>();
  for (const s of spans(a)) {
    if (!range.intersectsNode(s)) continue;
    const part = document.createRange();
    part.selectNodeContents(s);
    if (part.compareBoundaryPoints(Range.START_TO_START, range) < 0) part.setStart(range.startContainer, range.startOffset);
    if (part.compareBoundaryPoints(Range.END_TO_END, range) > 0) part.setEnd(range.endContainer, range.endOffset);
    const frag = part.cloneContents();
    for (const n of frag.querySelectorAll(".vn")) n.remove();
    if (frag.textContent?.trim()) hit.add(Number(s.dataset.v));
  }
  return order(a).filter((v) => hit.has(v));
}

let timer = 0;
function fromText(): void {
  const a = article();
  const sel = getSelection();
  if (!a || !sel) return;
  if (sel.isCollapsed || !sel.rangeCount) {
    if (source === "text") set([], "text", false);
    return;
  }
  const vs = versesFromRange(a, sel.getRangeAt(0));
  if (vs.length) {
    anchor = vs[0]!;
    cursor = vs[vs.length - 1]!;
  }
  set(vs, "text", false);
}
const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(fromText, 30);
};

document.addEventListener("selectionchange", schedule);
document.addEventListener("pointerup", schedule);

document.addEventListener("click", (e) => {
  const vn = (e.target as Element).closest?.("article.chapter .vn");
  const a = article();
  if (!vn || !a) return;
  const v = Number(vn.closest<HTMLElement>(".v")?.dataset.v);
  e.preventDefault();
  if (e.shiftKey && anchor !== null) {
    const keep = anchor;
    selectVerses(between(a, keep, v));
    anchor = keep;
    cursor = v;
  } else if (selected.length === 1 && selected[0] === v) clearVerseSelection();
  else selectVerses([v]);
});

function onKey(e: KeyboardEvent): void {
  const a = article();
  if (!a || e.target !== a || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const all = order(a);
  const at = cursor === null ? -1 : all.indexOf(cursor);
  const next = all[Math.min(all.length - 1, Math.max(0, at < 0 ? 0 : at + (e.key === "ArrowDown" ? 1 : -1)))]!;
  if (e.shiftKey && anchor !== null) {
    const keep = anchor;
    selectVerses(between(a, keep, next));
    anchor = keep;
  } else selectVerses([next]);
  cursor = next;
  a.querySelector(`.v[data-v="${next}"]`)?.scrollIntoView({ block: "nearest" });
}

/** The article is the keyboard entry point for verse selection (Tab into it, then arrows). */
function arm(): void {
  selected = [];
  anchor = cursor = null;
  const a = article();
  if (!a || a.dataset.armed) return;
  a.dataset.armed = "1";
  a.tabIndex = 0;
  a.setAttribute("aria-label", "Chapter text. Use the up and down arrow keys to select verses.");
  a.addEventListener("keydown", onKey);
}

arm();
addEventListener("quiet:chapter", arm);
