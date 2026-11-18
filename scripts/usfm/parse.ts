// USFM → Chapter JSON (D§6.2 mapping list, D§3.2 content model). Pure function.
import type { Block, BookId, Chapter, Item, Line, Translation } from "@tolle/core";

// Character styles whose text is kept and whose markers are dropped (D§6.2:
// \wj, \add, \w → text only; no red-letter data, R3).
const TEXT_ONLY = new Set(["wj", "add", "w", "tl", "qs", "bk", "k", "it", "bd", "em", "sc", "pn", "sls", "qt"]);
// Paragraph markers that start a prose block.
const PROSE = new Set(["p", "m", "pmo", "pc", "pi", "pi1", "pi2", "mi", "nb", "li", "li1", "li2", "li3", "pm", "pmr", "cls"]);
// Heading-like paragraph markers → { t: 'h' }.
const HEADING = new Set(["s", "s1", "s2", "s3", "ms", "ms1", "ms2", "sp", "qa", "mr0"]);
// Lines dropped entirely: book headers, parallel-passage refs, chapter labels.
const DROP_LINE = new Set(["id", "ide", "usfm", "h", "toc1", "toc2", "toc3", "mt", "mt1", "mt2", "mt3", "r", "mr", "cl", "rem", "sr"]);
const POETRY: Record<string, Line["i"]> = { q: 0, q1: 0, q2: 1, q3: 2, q4: 3, qr: 2, qc: 1, qm1: 0, qm2: 1 };

export class UsfmError extends Error {}

/** Removes `|attr` from `\w word|strong="…"\w*` and cross-references, `\ref`. */
function preclean(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .replace(/\\x\s.*?\\x\*/gs, "")
    .replace(/\\ref\s([^|\\]*)\|[^\\]*\\ref\*/g, "$1")
    .replace(/\|[^\\|]*?(\\\+?[a-z]+[0-9]*\*)/g, "$1");
}

/** Footnote body → plain note text (drops \fr origin, keeps \ft/\fq/\fqa/\fv text). */
function noteText(body: string): string {
  return body
    .replace(/^\s*\S+\s*/, "") // caller `+`, `-` or `?`
    .replace(/\\fr\s[^\\]*/, "")
    .replace(/\\fv\*/g, " ")
    .replace(/\\\+?[a-z]+[0-9]*\*/g, "")
    .replace(/\\\+?[a-z]+[0-9]* ?/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:!?)\]’”])/g, "$1") // `\ft .` after a quoted span
    .trim()
    .normalize("NFC");
}

// An opening marker swallows one following space (USFM syntax); closing markers do not.
const TOKEN = /\\(\+?[a-z]+[0-9]*)(?:(\*)| ?)|([^\\]+)/g;

export function parseUsfm(src: string, tr: Translation, book: BookId): Chapter[] {
  const chapters: Chapter[] = [];
  let ch: Chapter | null = null;
  let pending: Block[] = []; // headings before \c 1 (e.g. Psalms "BOOK I")
  let block: Block | null = null;
  let line: Line | null = null;
  let heading: { t: "h"; text: string } | null = null;
  let nd: string[] | null = null;
  const where = () => `${tr} ${book} ${ch?.chapter ?? 0}`;

  const items = (): Item[] => {
    if (!ch) throw new UsfmError(`${where()}: text before \\c 1`);
    if (block === null || block.t === "h") {
      block = { t: "p", items: [] };
      ch.blocks.push(block);
    }
    if (block.t === "q") {
      if (!line) {
        line = { i: 0, items: [] };
        block.lines.push(line);
      }
      return line.items;
    }
    return block.items;
  };
  const pushText = (s: string) => {
    if (heading) { heading.text += s; return; }
    if (nd) { nd.push(s); return; }
    if (!s.trim() && (block === null || block.t === "h")) return;
    if (!ch) {
      if (s.trim()) throw new UsfmError(`${where()}: text before \\c 1: ${s.slice(0, 40)}`);
      return;
    }
    const arr = items();
    const last = arr.at(-1);
    if (typeof last === "string") arr[arr.length - 1] = last + s;
    else arr.push(s);
  };
  const open = (b: Block | null) => {
    heading = null;
    line = null;
    block = b;
    if (b) (ch ? ch.blocks : pending).push(b);
  };

  for (const raw of preclean(src).split("\n")) {
    const lead = raw.match(/^\s*\\([a-z]+[0-9]*)(?![a-z0-9])/)?.[1];
    heading = null; // headings run to the end of their line
    if (lead && DROP_LINE.has(lead)) continue;
    if (/\\v\s+\d+[-,]\d/.test(raw)) throw new UsfmError(`${where()}: verse bridge not supported`);
    const notes: string[] = [];
    const lineSrc = raw
      .replace(/\\f\s(.*?)\\f\*/g, (_m, body: string) => `\\zf${notes.push(noteText(body)) - 1} `)
      .replace(/\\c\s+(\d+)\s*/g, "\\zc$1 ")
      .replace(/\\v\s+(\d+)\s?/g, "\\zv$1 ");
    if (/\\f[\s*]/.test(lineSrc)) throw new UsfmError(`${where()}: unterminated footnote`);
    for (const m of lineSrc.matchAll(TOKEN)) {
      const [, mk, star, txt] = m;
      if (txt !== undefined) { pushText(txt.replace(/\s+/g, " ")); continue; }
      const name = mk!.replace(/^\+/, "");
      const closing = star === "*";
      const num = Number(name.slice(2));
      if (name.startsWith("zc")) {
        if (num !== chapters.length + 1) throw new UsfmError(`${where()}: chapter ${num} out of order`);
        ch = { tr, book, chapter: num, blocks: pending };
        pending = [];
        chapters.push(ch);
        open(null);
      } else if (name.startsWith("zv")) {
        heading = null;
        items().push({ v: num });
      } else if (name.startsWith("zf")) {
        if (!ch) throw new UsfmError(`${where()}: footnote before \\c 1`);
        const arr = (ch.notes ??= []);
        arr.push(notes[num]!);
        if (!heading) items().push({ fn: arr.length - 1 });
      } else if (TEXT_ONLY.has(name)) {
        // markers dropped, text kept
      } else if (name === "nd") {
        if (!closing) nd = [];
        else {
          const s = (nd ?? []).join("").replace(/\s+/g, " ").trim();
          nd = null;
          if (s) items().push({ nd: s.normalize("NFC") });
        }
      } else if (closing) {
        throw new UsfmError(`${where()}: unexpected \\${mk}*`);
      } else if (PROSE.has(name)) open({ t: "p", items: [] });
      else if (name === "d") open({ t: "d", items: [] });
      else if (name === "b") open(null);
      else if (name in POETRY) {
        if ((block as Block | null)?.t !== "q") open({ t: "q", lines: [] });
        line = { i: POETRY[name]!, items: [] };
        (block as unknown as { lines: Line[] }).lines.push(line);
      } else if (HEADING.has(name)) {
        const h = { t: "h" as const, text: "" };
        open(h);
        heading = h;
      } else {
        throw new UsfmError(`${where()}: unknown marker \\${mk}`);
      }
    }
  }
  return chapters.map(finish);
}

function tidy(arr: Item[]): Item[] {
  const out: Item[] = [];
  for (const it of arr) {
    if (typeof it === "string") {
      const s = it.normalize("NFC");
      const last = out.at(-1);
      if (typeof last === "string") out[out.length - 1] = last + s;
      else out.push(s);
    } else out.push(it);
  }
  // Trim the outer whitespace of the block and collapse runs.
  for (let i = 0; i < out.length; i++) {
    const it = out[i];
    if (typeof it === "string") out[i] = it.replace(/\s+/g, " ");
  }
  if (typeof out[0] === "string") out[0] = out[0].trimStart();
  const li = out.length - 1;
  if (typeof out[li] === "string") out[li] = (out[li] as string).trimEnd();
  return out.filter((it) => it !== "");
}

function finish(ch: Chapter): Chapter {
  const blocks: Block[] = [];
  for (const b of ch.blocks) {
    if (b.t === "h") {
      const text = b.text.replace(/\s+/g, " ").trim().normalize("NFC");
      if (text) blocks.push({ t: "h", text });
    } else if (b.t === "q") {
      const lines = b.lines.map((l) => ({ i: l.i, items: tidy(l.items) })).filter((l) => l.items.length > 0);
      if (lines.length) blocks.push({ t: "q", lines });
    } else {
      const items = tidy(b.items);
      if (items.length) blocks.push({ t: b.t, items });
    }
  }
  const out: Chapter = { tr: ch.tr, book: ch.book, chapter: ch.chapter, blocks };
  if (ch.notes?.length) out.notes = ch.notes;
  return out;
}
