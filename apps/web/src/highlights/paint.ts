// D§3.10 Apply/Paint (SPEC H2, H3): whole-verse writes through the store and CSS-only repaint via
// data-hl. Rendered (translation-local) verses map to canonical ids with toCanonical (D§3.9).
import { toCanonical, type BookId, type Translation } from "@tolle/core";
import { openStore, type Color, type Write } from "./store.ts";

const article = () => document.querySelector<HTMLElement>("article.chapter");

interface Ctx {
  tr: Translation;
  book: BookId;
  ch: number;
}
function ctx(a: HTMLElement): Ctx | null {
  const { tr, book, ch } = a.dataset;
  return tr && book && ch ? { tr: tr as Translation, book: book as BookId, ch: Number(ch) } : null;
}

export function canonicalIds(verses: readonly number[]): number[] {
  const a = article();
  const c = a && ctx(a);
  if (!c) return [];
  return [...new Set(verses.flatMap((v) => toCanonical(c.tr, c.book, c.ch, v)))].sort((x, y) => x - y);
}

function setVerse(a: HTMLElement, v: number, color: Color | undefined): void {
  const frags = [...a.querySelectorAll<HTMLElement>(`.v[data-v="${v}"]`)];
  for (const f of frags) {
    if (color) f.dataset.hl = color;
    else delete f.dataset.hl;
    f.querySelector(".hl-sr")?.remove();
  }
  const last = frags[frags.length - 1];
  if (color && last) {
    const sr = document.createElement("span");
    sr.className = "sr-only hl-sr";
    sr.textContent = " (highlighted)";
    last.append(sr);
  }
}

/** Current color per rendered verse (canonical lookup, one range read). */
export async function colorsByVerse(): Promise<Map<number, Color>> {
  const a = article();
  const c = a && ctx(a);
  const out = new Map<number, Color>();
  if (!a || !c) return out;
  const verses = [...new Set([...a.querySelectorAll<HTMLElement>(".v[data-v]")].map((s) => Number(s.dataset.v)))];
  const ids = new Map(verses.map((v) => [v, toCanonical(c.tr, c.book, c.ch, v)]));
  const flat = [...ids.values()].flat();
  if (!flat.length) return out;
  const rows = await (await openStore()).range(Math.min(...flat), Math.max(...flat));
  for (const [v, vids] of ids) {
    const color = vids.map((id) => rows.get(id)).find(Boolean);
    if (color) out.set(v, color);
  }
  return out;
}

export async function paint(): Promise<void> {
  const a = article();
  if (!a) return;
  const colors = await colorsByVerse();
  if (a !== article()) return; // navigated meanwhile
  const verses = new Set([...a.querySelectorAll<HTMLElement>(".v[data-v]")].map((s) => Number(s.dataset.v)));
  for (const v of verses) setVerse(a, v, colors.get(v));
}

/** Writes color (null = remove) for whole local verses; returns the writes and their prior state (undo). */
export async function applyColor(verses: readonly number[], color: Color | null): Promise<{ prior: Write[]; next: Write[] }> {
  const store = await openStore();
  const ids = canonicalIds(verses);
  const now = Date.now();
  const prior = await Promise.all(
    ids.map(async (id) => {
      const r = await store.get(id);
      return { verseId: id, color: r && !r.deleted ? r.color : null, updatedAt: r?.updatedAt ?? 0 };
    }),
  );
  const next = ids.map((verseId) => ({ verseId, color, updatedAt: now }));
  await store.apply(next);
  await paint();
  return { prior, next };
}
