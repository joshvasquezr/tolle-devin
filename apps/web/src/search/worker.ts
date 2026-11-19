// D§3.11 search Web Worker: loads a translation's index on first use, then answers queries.
import { loadEngine, search, type Engine, type SearchFile } from "./query.ts";

export interface SearchRequest {
  id: number;
  url: string; // /data/{tr}/search.v{hash}.json
  q: string;
  scope?: string;
  page?: number;
}

const engines = new Map<string, Promise<Engine>>();

function engine(url: string): Promise<Engine> {
  let e = engines.get(url);
  if (!e) {
    e = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`index ${r.status}`);
      return loadEngine((await r.json()) as SearchFile);
    });
    e.catch(() => engines.delete(url));
    engines.set(url, e);
  }
  return e;
}

self.addEventListener("message", async (ev: MessageEvent<SearchRequest>) => {
  const { id, url, q, scope, page } = ev.data;
  try {
    const t0 = performance.now();
    const res = search(await engine(url), q, { scope, page });
    self.postMessage({ id, ok: true, res, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : "error" });
  }
});
