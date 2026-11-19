// P3.4 search results island: /search?q&t&scope&page → worker query → result rows (SPEC S1–S4).
import { PD_TRANSLATIONS, TRANSLATION_NAMES, decodeVerseId, formatPath, formatRef, fromCanonical, stem, words, type PdTranslation } from "@tolle/core";
import type { Results } from "../search/query.ts";

const root = document.getElementById("search");

function emphasize(text: string, stems: Set<string>): DocumentFragment {
  const frag = document.createDocumentFragment();
  // Split into word and non-word runs; a word is marked when its stem matches a query stem.
  for (const part of text.split(/([\p{L}\p{N}]+(?:['’][\p{L}]+)*)/u)) {
    if (!part) continue;
    const w = words(part)[0];
    if (w && stems.has(stem(w))) {
      const m = document.createElement("mark");
      m.textContent = part;
      frag.append(m);
    } else frag.append(part);
  }
  return frag;
}

if (root) {
  const urls = JSON.parse(root.dataset.index ?? "{}") as Record<string, string>;
  const params = new URLSearchParams(location.search);
  const q = (params.get("q") ?? "").trim();
  const t = params.get("t")?.toLowerCase();
  const tr: PdTranslation = t && (PD_TRANSLATIONS as readonly string[]).includes(t) ? (t as PdTranslation) : "bsb";
  const scope = params.get("scope") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const status = document.getElementById("search-status")!;
  const list = document.getElementById("search-results")!;
  const select = document.getElementById("search-scope") as HTMLSelectElement;
  const bar = document.getElementById("refbar") as HTMLInputElement | null;
  const trBtn = document.getElementById("tr-btn");

  const href = (p: Record<string, string | number>) => {
    const u = new URLSearchParams({ q, t: tr });
    for (const [k, v] of Object.entries(p)) if (v) u.set(k, String(v));
    return `/search?${u}`;
  };

  if (bar) bar.value = q;
  if (trBtn) trBtn.textContent = tr.toUpperCase();
  select.value = [...select.options].some((o) => o.value === scope) ? scope : "";
  select.addEventListener("change", () => location.assign(href({ scope: select.value })));
  document.getElementById("search-title")!.textContent = q ? `Search: ${q}` : "Search";
  document.title = q ? `${q} — Search — ${TRANSLATION_NAMES[tr]}` : document.title;

  if (!q) {
    status.textContent = "Type words in the bar above to search.";
  } else {
    status.textContent = "Searching…";
    const worker = new Worker(new URL("../search/worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (e: MessageEvent<{ ok: boolean; res?: Results }>) => {
      worker.terminate();
      if (!e.data.ok || !e.data.res) {
        status.textContent = "Search is unavailable right now.";
        return;
      }
      const r = e.data.res;
      if (!r.total) {
        status.textContent = `No verses found for “${q}”.`;
        return;
      }
      const first = (r.page - 1) * 25 + 1;
      status.textContent = `${r.total.toLocaleString("en-US")} verse${r.total === 1 ? "" : "s"} · ${TRANSLATION_NAMES[tr]}${r.pages > 1 ? ` · ${first}–${first + r.hits.length - 1}` : ""}`;
      const stems = new Set(r.words.map(stem));
      list.replaceChildren(
        ...r.hits.map((h) => {
          const { book, chapter, verse } = decodeVerseId(h.id);
          const local = fromCanonical(tr, h.id) ?? { ch: chapter, v: verse };
          const ref = { book, chapter: local.ch, vStart: local.v };
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = formatPath(tr, ref);
          a.textContent = formatRef(ref);
          const p = document.createElement("p");
          p.append(emphasize(h.text, stems));
          li.append(a, p);
          return li;
        }),
      );
      if (r.pages > 1) {
        const pager = document.getElementById("search-pager")!;
        pager.hidden = false;
        document.getElementById("search-page")!.textContent = `Page ${r.page} of ${r.pages}`;
        const prev = document.getElementById("search-prev") as HTMLAnchorElement;
        const next = document.getElementById("search-next") as HTMLAnchorElement;
        if (r.page > 1) prev.href = href({ scope, page: r.page - 1 });
        else prev.setAttribute("aria-disabled", "true");
        if (r.page < r.pages) next.href = href({ scope, page: r.page + 1 });
        else next.setAttribute("aria-disabled", "true");
      }
    });
    worker.postMessage({ id: 1, url: urls[tr], q, scope, page });
  }
}
