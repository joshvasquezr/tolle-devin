// D§3.2 plainVerses: flattens a chapter to verse → text for search, copy and ARIA.
import type { Block, Chapter, Item } from "./types.ts";

function itemsOf(b: Block): Item[][] {
  switch (b.t) {
    case "h": return [];
    case "d":
    case "p": return [b.items];
    case "q": return b.lines.map((l) => l.items);
  }
}

/** Verse number → plain text. Text before the first verse marker (titles) is dropped. */
export function plainVerses(chapter: Pick<Chapter, "blocks">): Map<number, string> {
  const out = new Map<number, string>();
  let v = 0;
  const add = (s: string) => {
    if (v > 0) out.set(v, (out.get(v) ?? "") + s);
  };
  for (const b of chapter.blocks) {
    for (const items of itemsOf(b)) {
      add(" ");
      for (const it of items) {
        if (typeof it === "string") add(it);
        else if ("v" in it) { v = it.v; out.set(v, out.get(v) ?? ""); }
        else if ("nd" in it) add(it.nd);
      }
    }
  }
  for (const [k, s] of out) out.set(k, s.replace(/\s+/g, " ").trim());
  return out;
}
