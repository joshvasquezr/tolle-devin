// D§3.10 Store (SPEC H3, H6): IndexedDB "quiet" v1 — highlights, outbox, meta. Rows hold only
// verseId (key), color and timestamps; never verse text. Fallback: in-memory map persisted to localStorage.
export const COLORS = ["sand", "sage", "slate", "rose"] as const;
export type Color = (typeof COLORS)[number];

export interface HighlightRow {
  color: Color | null;
  updatedAt: number;
  deleted: boolean;
}
export interface OutboxRow {
  color: Color | null;
  updatedAt: number;
}
export interface Write {
  verseId: number;
  color: Color | null;
  updatedAt: number;
}

export interface Store {
  readonly kind: "idb" | "local";
  /** Writes highlights + outbox together (one transaction) and notifies other tabs. */
  apply(writes: readonly Write[]): Promise<void>;
  /** Live (not deleted) highlights with lo ≤ verseId ≤ hi. */
  range(lo: number, hi: number): Promise<Map<number, Color>>;
  get(verseId: number): Promise<HighlightRow | undefined>;
  all(): Promise<Map<number, HighlightRow>>;
  outbox(): Promise<Map<number, OutboxRow>>;
  clearOutbox(ids: readonly number[]): Promise<void>;
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
}

export const DB_NAME = "quiet";
export const LOCAL_KEY = "quiet.hl.v1";
export const CHANNEL = "quiet-highlights";

export const isColor = (c: unknown): c is Color => typeof c === "string" && (COLORS as readonly string[]).includes(c);

const row = (w: Write): HighlightRow => ({ color: w.color, updatedAt: w.updatedAt, deleted: w.color === null });

function notify(ids: readonly number[]): void {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel(CHANNEL);
  ch.postMessage({ ids });
  ch.close();
}

/** Subscribe to writes made in other tabs. */
export function onRemoteChange(fn: (ids: number[]) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e: MessageEvent<{ ids: number[] }>) => fn(e.data.ids);
  return () => ch.close();
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = tx.onabort = () => rej(tx.error);
  });

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  const r = idb.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    for (const s of ["highlights", "outbox", "meta"]) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
  };
  return req(r);
}

async function idbStore(idb: IDBFactory): Promise<Store> {
  const db = await openDb(idb);
  const read = async <T>(store: string, range?: IDBKeyRange) => {
    const tx = db.transaction(store);
    const os = tx.objectStore(store);
    const [keys, vals] = await Promise.all([req(os.getAllKeys(range)), req(os.getAll(range))]);
    return new Map(keys.map((k, i) => [k as number, vals[i] as T]));
  };
  return {
    kind: "idb",
    async apply(writes) {
      const tx = db.transaction(["highlights", "outbox"], "readwrite");
      for (const w of writes) {
        tx.objectStore("highlights").put(row(w), w.verseId);
        tx.objectStore("outbox").put({ color: w.color, updatedAt: w.updatedAt } satisfies OutboxRow, w.verseId);
      }
      await done(tx);
      notify(writes.map((w) => w.verseId));
    },
    async range(lo, hi) {
      const rows = await read<HighlightRow>("highlights", IDBKeyRange.bound(lo, hi));
      return new Map([...rows].filter(([, r]) => !r.deleted && r.color).map(([k, r]) => [k, r.color!]));
    },
    async get(id) {
      return req(db.transaction("highlights").objectStore("highlights").get(id)) as Promise<HighlightRow | undefined>;
    },
    all: () => read<HighlightRow>("highlights"),
    outbox: () => read<OutboxRow>("outbox"),
    async clearOutbox(ids) {
      const tx = db.transaction("outbox", "readwrite");
      for (const id of ids) tx.objectStore("outbox").delete(id);
      await done(tx);
    },
    getMeta: (k) => req(db.transaction("meta").objectStore("meta").get(k)),
    async setMeta(k, v) {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put(v, k);
      await done(tx);
    },
  };
}

interface LocalShape {
  h: Record<string, HighlightRow>;
  o: Record<string, OutboxRow>;
  m: Record<string, unknown>;
}

function localStore(storage: Storage | undefined): Store {
  let data: LocalShape = { h: {}, o: {}, m: {} };
  try {
    const raw = storage?.getItem(LOCAL_KEY);
    if (raw) data = { h: {}, o: {}, m: {}, ...(JSON.parse(raw) as Partial<LocalShape>) };
  } catch {
    /* corrupt or blocked: start empty */
  }
  const save = () => {
    try {
      storage?.setItem(LOCAL_KEY, JSON.stringify(data));
    } catch {
      /* quota or blocked: memory only */
    }
  };
  const entries = <T>(o: Record<string, T>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
  return {
    kind: "local",
    async apply(writes) {
      for (const w of writes) {
        data.h[w.verseId] = row(w);
        data.o[w.verseId] = { color: w.color, updatedAt: w.updatedAt };
      }
      save();
      notify(writes.map((w) => w.verseId));
    },
    async range(lo, hi) {
      return new Map([...entries(data.h)].filter(([k, r]) => k >= lo && k <= hi && !r.deleted && r.color).map(([k, r]) => [k, r.color!]));
    },
    get: async (id) => data.h[id],
    all: async () => entries(data.h),
    outbox: async () => entries(data.o),
    async clearOutbox(ids) {
      for (const id of ids) delete data.o[id];
      save();
    },
    getMeta: async (k) => data.m[k],
    async setMeta(k, v) {
      data.m[k] = v;
      save();
    },
  };
}

let shared: Promise<Store> | undefined;

/** The page's store: IndexedDB when it opens, else the localStorage fallback (some private modes). */
export function openStore(env: { indexedDB?: IDBFactory | undefined; localStorage?: Storage | undefined } = globalThis): Promise<Store> {
  const make = async () => {
    try {
      if (env.indexedDB) return await idbStore(env.indexedDB);
    } catch {
      /* fall through */
    }
    return localStore(env.localStorage);
  };
  if (env !== globalThis) return make();
  return (shared ??= make());
}
