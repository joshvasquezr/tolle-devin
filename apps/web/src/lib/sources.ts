// SPEC §8.2: the About page lists each translation, source and status, read from data/sources/SOURCES.md at build.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PD_TRANSLATIONS, TRANSLATION_NAMES, type PdTranslation } from "@tolle/core";

export interface SourceRow {
  tr: PdTranslation;
  name: string;
  url: string;
  version: string;
  sha256: string;
  status: string;
}

const plain = (cell: string) => cell.replace(/\*\*|`/g, "").trim();

export function parseSources(md: string): SourceRow[] {
  const rows: SourceRow[] = [];
  for (const line of md.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const tr = cells[0]?.toLowerCase();
    if (cells.length !== 5 || !tr || !(PD_TRANSLATIONS as readonly string[]).includes(tr)) continue;
    const urls = cells[1]!.match(/https:\/\/[^\s`)]+/g) ?? [];
    rows.push({
      tr: tr as PdTranslation,
      name: TRANSLATION_NAMES[tr as PdTranslation],
      url: urls.at(-1) ?? "",
      version: plain(cells[2]!),
      sha256: plain(cells[3]!),
      status: plain(cells[4]!),
    });
  }
  return rows;
}

export function loadSources(): SourceRow[] {
  // App root is apps/web (see chapters.ts); SOURCES.md lives at the repo root.
  const url = new URL("../../data/sources/SOURCES.md", pathToFileURL(`${process.cwd()}/`));
  return parseSources(readFileSync(url, "utf8"));
}
