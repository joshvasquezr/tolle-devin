// D§3.10 Apply step 4: in-memory undo (cap 50). Undo re-applies the prior state as new writes with a
// fresh timestamp, so last-write-wins sync stays monotonic (never rewinds updatedAt).
import type { Store, Write } from "./store.ts";

export interface Op {
  prior: Write[];
  next: Write[];
}

export const UNDO_CAP = 50;

export function inverse(op: Op, now: number): Write[] {
  return op.prior.map((p) => ({ verseId: p.verseId, color: p.color, updatedAt: now }));
}

export function createHistory(cap = UNDO_CAP) {
  const stack: Op[] = [];
  return {
    record(op: Op): void {
      if (!op.next.length) return;
      stack.push(op);
      if (stack.length > cap) stack.shift();
    },
    get size(): number {
      return stack.length;
    },
    /** Applies the inverse of the last op; returns its writes, or null when there is nothing to undo. */
    async undo(store: Store, now = Date.now()): Promise<Write[] | null> {
      const op = stack.pop();
      if (!op) return null;
      const writes = inverse(op, Math.max(now, ...op.next.map((w) => w.updatedAt + 1)));
      await store.apply(writes);
      return writes;
    },
  };
}

export const history = createHistory();
