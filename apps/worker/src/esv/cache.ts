// D§3.12 Cache, tightened by Crossway (docs/esv-compliance.md): at most 500 ESV verses stored at once
// across all entries, each entry one window, TTL ≤ 24 h. Lives in memory of the single EsvBudget DO,
// so the total is global and nothing is persisted to disk.
import type { Block } from "@tolle/core";

export const MAX_CACHED_VERSES = 500;
export const CACHE_TTL_MS = 86_400_000;

interface Entry {
  blocks: Block[];
  verses: number;
  at: number;
}

export class VerseCappedCache {
  // Map keeps insertion order; a hit re-inserts, so the first key is least recently used.
  private readonly entries = new Map<string, Entry>();
  private total = 0;

  get size(): number {
    return this.total;
  }

  get(key: string, now: number): Block[] | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (now - e.at >= CACHE_TTL_MS) {
      this.drop(key, e);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.blocks;
  }

  /** Stores one window; evicts least recently used entries until the 500-verse total holds. */
  put(key: string, blocks: Block[], verses: number, now: number): boolean {
    if (!Number.isInteger(verses) || verses < 1 || verses > MAX_CACHED_VERSES) return false;
    const old = this.entries.get(key);
    if (old) this.drop(key, old);
    for (const [k, e] of this.entries) {
      if (this.total + verses <= MAX_CACHED_VERSES) break;
      this.drop(k, e);
    }
    this.entries.set(key, { blocks, verses, at: now });
    this.total += verses;
    return true;
  }

  private drop(key: string, e: Entry): void {
    this.entries.delete(key);
    this.total -= e.verses;
  }
}
