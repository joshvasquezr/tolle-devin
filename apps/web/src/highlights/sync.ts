// D§4.3 sync engine (SPEC A3–A7): push the outbox, pull by cursor, LWW-apply, repaint.
import { ACCOUNT_KEY } from "../scripts/account.ts";
import { isColor, openStore, type Store, type Write } from "./store.ts";

export const BATCH = 200;
export const BACKOFF_MIN = 2_000;
export const BACKOFF_MAX = 300_000;
export const WRITE_DELAY = 2_000;

export class SignedOut extends Error {}
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const JSON_POST = { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin" } as const;

/** One push + pull round. Returns the verse ids changed locally by the pull. */
export async function syncOnce(store: Store, fetcher: Fetch): Promise<number[]> {
  const first = !(await store.getMeta("synced"));
  const outbox = await store.outbox();
  const pending: Write[] = [...outbox].map(([verseId, r]) => ({ verseId, color: r.color, updatedAt: r.updatedAt }));
  // A3 first sign-in: every local row goes up, then a full pull; LWW keeps the newer side.
  if (first) for (const [verseId, r] of await store.all()) if (!outbox.has(verseId)) pending.push({ verseId, color: r.deleted ? null : r.color, updatedAt: r.updatedAt });
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    const r = await fetcher("/api/v1/highlights/batch", { ...JSON_POST, body: JSON.stringify({ items: chunk }) });
    if (r.status === 401) throw new SignedOut();
    if (!r.ok) throw new Error(`push ${r.status}`);
    // Clear only entries unchanged since they were sent; a newer local write stays queued.
    const now = await store.outbox();
    await store.clearOutbox(chunk.filter((w) => now.get(w.verseId)?.updatedAt === w.updatedAt && now.get(w.verseId)?.color === w.color).map((w) => w.verseId));
  }
  const since = first ? 0 : Number((await store.getMeta("cursor")) ?? 0);
  const r = await fetcher(`/api/v1/highlights?since=${since}`, { credentials: "same-origin" });
  if (r.status === 401) throw new SignedOut();
  if (!r.ok) throw new Error(`pull ${r.status}`);
  const body = (await r.json()) as { items: { verseId: number; color: unknown; updatedAt: number }[]; cursor: number; reset: boolean };
  const incoming: Write[] = [];
  const seen = new Set<number>();
  for (const it of body.items) {
    if (typeof it.verseId !== "number" || typeof it.updatedAt !== "number" || !(it.color === null || isColor(it.color))) continue;
    seen.add(it.verseId);
    const cur = await store.get(it.verseId);
    if (!cur || cur.updatedAt < it.updatedAt) incoming.push({ verseId: it.verseId, color: it.color, updatedAt: it.updatedAt });
  }
  if (body.reset) {
    // Full live set: anything else local was deleted on the server (its tombstone was purged);
    // our own pending writes were pushed above, so they are in the set.
    const queued = await store.outbox();
    for (const [verseId, row] of await store.all()) if (!row.deleted && !seen.has(verseId) && !queued.has(verseId)) incoming.push({ verseId, color: null, updatedAt: row.updatedAt });
  }
  if (incoming.length) await store.applyRemote(incoming);
  await store.setMeta("cursor", body.cursor);
  await store.setMeta("synced", true);
  await store.setMeta("lastSync", Date.now());
  return incoming.map((w) => w.verseId);
}

export interface Engine {
  syncNow(): Promise<void>;
  stop(): void;
}

/** Triggers: start, focus, online, 2 s after a local write; retries back off 2 s → 5 min (A6). */
export function startSync(store: Store, fetcher: Fetch = (u, i) => fetch(u, i)): Engine {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let backoff = 0;
  let running: Promise<void> | null = null;
  let again = false;
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), ms);
  };
  const run = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        const changed = await syncOnce(store, fetcher);
        backoff = 0;
        dispatchEvent(new CustomEvent("quiet:highlights-synced", { detail: { changed } }));
      } catch (e) {
        if (e instanceof SignedOut) {
          localStorage.removeItem(ACCOUNT_KEY);
          stop();
          dispatchEvent(new CustomEvent("quiet:signed-out"));
          return;
        }
        backoff = Math.min(BACKOFF_MAX, backoff ? backoff * 2 : BACKOFF_MIN);
        schedule(backoff);
      } finally {
        running = null;
        if (again) {
          again = false;
          void run();
        }
      }
    })();
    return running;
  };
  const onFocus = () => void run();
  const onWrite = () => schedule(WRITE_DELAY);
  addEventListener("focus", onFocus);
  addEventListener("online", onFocus);
  addEventListener("quiet:highlight-written", onWrite);
  const stop = () => {
    clearTimeout(timer);
    removeEventListener("focus", onFocus);
    removeEventListener("online", onFocus);
    removeEventListener("quiet:highlight-written", onWrite);
  };
  void run();
  return { syncNow: run, stop };
}

/** SPEC A7: local highlights stay unless the user also clears this device. */
export async function signOut(store: Store, clearDevice: boolean, fetcher: Fetch = (u, i) => fetch(u, i)): Promise<void> {
  await fetcher("/api/v1/auth/signout", { ...JSON_POST, body: "{}" }).catch(() => undefined);
  localStorage.removeItem(ACCOUNT_KEY);
  if (clearDevice) await store.clear();
  else for (const k of ["cursor", "synced", "lastSync"]) await store.setMeta(k, undefined);
  engine?.stop();
  engine = undefined;
  dispatchEvent(new CustomEvent("quiet:signed-out"));
}

let engine: Engine | undefined;
export const currentEngine = () => engine;

if (typeof document !== "undefined") {
  if (localStorage.getItem(ACCOUNT_KEY)) void openStore().then((s) => (engine = startSync(s)));
  addEventListener("quiet:sync-now", () => void engine?.syncNow());
  addEventListener("quiet:sign-out", (e) => {
    void openStore().then((s) => signOut(s, !!(e as CustomEvent<{ clear?: boolean }>).detail?.clear));
  });
}
