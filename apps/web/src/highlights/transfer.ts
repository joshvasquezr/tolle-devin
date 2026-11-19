// SPEC H8 / D§3.10 export/import: `{ version: 1, items: [{ verseId, color, updatedAt }] }`; import
// merges last-write-wins and reports a count. Only whitelisted fields are read (H6).
import { isVerseId } from "@tolle/core";
import { isColor, openStore, type Color, type Store, type Write } from "./store.ts";

export interface ExportFile {
  version: 1;
  items: { verseId: number; color: Color; updatedAt: number }[];
}

export async function exportFile(store: Store): Promise<ExportFile> {
  const items = [...(await store.all())]
    .filter(([, r]) => !r.deleted && r.color)
    .map(([verseId, r]) => ({ verseId, color: r.color!, updatedAt: r.updatedAt }))
    .sort((a, b) => a.verseId - b.verseId);
  return { version: 1, items };
}

/** Valid items from untrusted JSON; throws on a wrong shape or version. */
export function parseImport(text: string): Write[] {
  const data = JSON.parse(text) as { version?: unknown; items?: unknown };
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error("Not a Quiet Bible highlights file");
  const out: Write[] = [];
  for (const it of data.items as Record<string, unknown>[]) {
    const { verseId, color, updatedAt } = it ?? {};
    if (typeof verseId === "number" && isVerseId(verseId) && isColor(color) && typeof updatedAt === "number" && Number.isFinite(updatedAt) && updatedAt >= 0) {
      out.push({ verseId, color, updatedAt });
    }
  }
  return out;
}

/** LWW merge: an item wins only when strictly newer than the local row. Returns counts. */
export async function mergeImport(store: Store, items: readonly Write[]): Promise<{ applied: number; skipped: number }> {
  const winners: Write[] = [];
  const best = new Map<number, Write>();
  for (const it of items) if ((best.get(it.verseId)?.updatedAt ?? -1) < it.updatedAt) best.set(it.verseId, it);
  for (const it of best.values()) {
    const cur = await store.get(it.verseId);
    if (!cur || cur.updatedAt < it.updatedAt) winners.push(it);
  }
  if (winners.length) await store.apply(winners);
  return { applied: winners.length, skipped: items.length - winners.length };
}

const plural = (n: number) => `${n} highlight${n === 1 ? "" : "s"}`;

function wire(): void {
  const exp = document.getElementById("hl-export");
  const imp = document.getElementById("hl-import");
  const file = document.getElementById("hl-file") as HTMLInputElement | null;
  const status = document.getElementById("hl-status");
  if (!exp || !imp || !file || !status) return;
  exp.addEventListener("click", async () => {
    const data = await exportFile(await openStore());
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiet-highlights.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `Exported ${plural(data.items.length)}.`;
  });
  imp.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    try {
      const r = await mergeImport(await openStore(), parseImport(await f.text()));
      status.textContent = `Imported ${plural(r.applied)}${r.skipped ? ` (${r.skipped} already up to date)` : ""}.`;
      dispatchEvent(new CustomEvent("quiet:highlights-imported"));
    } catch {
      status.textContent = "That file could not be imported.";
    }
  });
}

if (typeof document !== "undefined") wire();
