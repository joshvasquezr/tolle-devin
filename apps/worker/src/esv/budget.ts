// D§3.12 Budget (SPEC §8.1): upstream ESV calls counted in sliding windows (60/min, 1,000/h,
// 5,000/day). Soft at ≥ 80% of any window (cache-only, no search), hard at ≥ 95% (no upstream).
import type { Block } from "@tolle/core";
import { VerseCappedCache } from "./cache.ts";

export const WINDOWS = [
  { ms: 60_000, limit: 60 },
  { ms: 3_600_000, limit: 1_000 },
  { ms: 86_400_000, limit: 5_000 },
] as const;
export const SOFT = 0.8;
export const HARD = 0.95;

export type BudgetState = "open" | "soft" | "hard";
/** Recorded for future per-kind accounting; in D§3.12 both are refused from soft on (soft = cache-only). */
export type CallKind = "passage" | "search";

export function prune(ts: readonly number[], now: number): number[] {
  const day = now - WINDOWS[2].ms;
  return ts.filter((t) => t > day && t <= now);
}

export function stateOf(ts: readonly number[], now: number): BudgetState {
  let worst = 0;
  for (const w of WINDOWS) {
    const from = now - w.ms;
    let n = 0;
    for (const t of ts) if (t > from && t <= now) n++;
    worst = Math.max(worst, n / w.limit);
  }
  return worst >= HARD ? "hard" : worst >= SOFT ? "soft" : "open";
}

/**
 * Decides one upstream call and counts it when allowed. Soft is cache-only (misses get 503 esv_busy,
 * search disabled), hard refuses everything; callers distinguish them only for messaging.
 */
export function consume(ts: readonly number[], now: number, _kind: CallKind): { ok: boolean; state: BudgetState; ts: number[] } {
  const kept = prune(ts, now);
  const state = stateOf(kept, now);
  const ok = state === "open";
  return ok ? { ok, state, ts: [...kept, now] } : { ok, state, ts: kept };
}

interface DoStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}
interface DoState {
  storage: DoStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * The EsvBudget durable object (one global instance, idFromName("global")). Timestamps persist in
 * DO storage, so restarts and evictions keep the windows. Requests: POST /consume {kind}, GET /state,
 * GET /cache?key=… and PUT /cache {key, blocks, verses} (the 500-verse ESV cache, memory only).
 */
export class EsvBudget {
  private ts: number[] = [];
  private readonly cache = new VerseCappedCache();
  private readonly state: DoState;
  private readonly clock: () => number;
  constructor(state: DoState, _env?: unknown, clock: () => number = Date.now) {
    this.state = state;
    this.clock = clock;
    void state.blockConcurrencyWhile(async () => {
      this.ts = (await state.storage.get<number[]>("ts")) ?? [];
    });
  }

  async fetch(req: Request): Promise<Response> {
    const now = this.clock();
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/consume") {
      const body = (await req.json().catch(() => ({}))) as { kind?: unknown };
      const kind: CallKind = body.kind === "search" ? "search" : "passage";
      const r = consume(this.ts, now, kind);
      this.ts = r.ts;
      await this.state.storage.put("ts", this.ts);
      return Response.json({ ok: r.ok, state: r.ok ? stateOf(this.ts, now) : r.state });
    }
    if (url.pathname === "/cache") {
      if (req.method === "GET") return Response.json({ blocks: this.cache.get(url.searchParams.get("key") ?? "", now) ?? null });
      if (req.method === "PUT") {
        const b = (await req.json().catch(() => ({}))) as { key?: unknown; blocks?: unknown; verses?: unknown };
        const ok = typeof b.key === "string" && Array.isArray(b.blocks) && this.cache.put(b.key, b.blocks as Block[], Number(b.verses), now);
        return Response.json({ ok });
      }
    }
    if (req.method === "GET" && url.pathname === "/state") return Response.json({ state: stateOf(prune(this.ts, now), now) });
    return new Response("not found", { status: 404 });
  }
}
