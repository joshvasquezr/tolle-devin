// D§3.12 Normalizer: allow-list tokenizer from ESV passage HTML to Block[] (headings, paragraphs,
// poetry lines and indents, verse markers, divine name). Unknown tags are dropped, their text kept;
// output holds no HTML. Tag/class names follow the public API docs and stay unverified until P5.1.
import type { Block, Item, Line } from "@tolle/core";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#8217": "’", "#8216": "‘", "#8220": "“", "#8221": "”", "#8212": "—", "#8211": "–" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (ENTITIES[e]) return ENTITIES[e]!;
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return m;
  });

type Tok = { t: "open"; name: string; cls: string } | { t: "close"; name: string } | { t: "text"; s: string };

function* tokens(html: string): Generator<Tok> {
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|</g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[3] !== undefined) yield { t: "text", s: decode(m[3]) };
    else if (m[1]) {
      const name = m[1].toLowerCase();
      if (m[0][1] === "/") yield { t: "close", name };
      else yield { t: "open", name, cls: /class\s*=\s*["']([^"']*)["']/i.exec(m[2] ?? "")?.[1] ?? "" };
    }
  }
}

const SKIP = new Set(["script", "style", "sup", "a", "noscript", "iframe", "object", "template"]);

export function normalizeEsv(html: string): Block[] {
  const blocks: Block[] = [];
  let items: Item[] | null = null;
  let kind: "p" | "q" | "d" | "h" | null = null;
  let lines: Line[] = [];
  let line: Line | null = null;
  let heading = "";
  let skip = 0;
  let num: "verse" | "chapter" | null = null;
  let numText = "";
  let divine = false;

  const target = (): Item[] => {
    if (kind === "q") return (line ??= { i: 0, items: [] }).items;
    return (items ??= []);
  };
  const flushLine = () => {
    if (line && line.items.length) lines.push(line);
    line = null;
  };
  const end = () => {
    if (kind === "h") {
      const text = heading.replace(/\s+/g, " ").trim();
      if (text) blocks.push({ t: "h", text });
    } else if (kind === "q") {
      flushLine();
      if (lines.length) blocks.push({ t: "q", lines });
    } else if (kind && items?.some((i) => typeof i !== "string" || i.trim())) blocks.push({ t: kind, items } as Block);
    kind = null;
    items = null;
    lines = [];
    heading = "";
  };
  const text = (s: string) => {
    if (skip || !s) return;
    if (num) return void (numText += s);
    if (kind === null) {
      if (!s.trim()) return;
      kind = "p";
    }
    if (kind === "h") return void (heading += s);
    const t = target();
    if (divine) t.push({ nd: s });
    else if (typeof t[t.length - 1] === "string") t[t.length - 1] += s;
    else t.push(s);
  };

  for (const tk of tokens(html)) {
    if (tk.t === "open") {
      if (SKIP.has(tk.name) && !/verse-num|chapter-num/.test(tk.cls)) {
        skip++;
        continue;
      }
      if (skip) continue;
      const cls = ` ${tk.cls} `;
      if (/^h[1-6]$/.test(tk.name)) {
        end();
        kind = / psalm-title /.test(cls) ? "d" : "h";
        if (kind === "d") items = [];
      } else if (tk.name === "p") {
        end();
        kind = / (block-indent|poetry|line-group) /.test(cls) ? "q" : "p";
      } else if (tk.name === "span" && / line /.test(cls)) {
        if (kind !== "q") {
          end();
          kind = "q";
        }
        flushLine();
        const indent = / indent-3 /.test(cls) ? 3 : / indent-2 /.test(cls) ? 2 : / indent /.test(cls) ? 1 : 0;
        line = { i: indent as Line["i"], items: [] };
      } else if (/ verse-num | chapter-num /.test(cls)) {
        num = / chapter-num /.test(cls) ? "chapter" : "verse";
        numText = "";
      } else if (/ divine-name /.test(cls)) divine = true;
      else if (tk.name === "br" && kind === "q") flushLine();
    } else if (tk.t === "close") {
      if (SKIP.has(tk.name) && skip) {
        skip--;
        continue;
      }
      if (skip) continue;
      if (num && (tk.name === "b" || tk.name === "span" || tk.name === "sup")) {
        // chapter-num "3:1" marks verse 1; verse-num "16" marks verse 16.
        const v = Number(/(\d+)\D*$/.exec(numText.trim())?.[1]);
        num = null;
        if (v > 0) {
          if (kind === null) kind = "p";
          target().push({ v });
        }
      } else if (tk.name === "small" || (divine && tk.name === "span")) divine = false;
      else if (/^h[1-6]$/.test(tk.name) || tk.name === "p") end();
    } else text(tk.s);
  }
  end();
  // Leading whitespace after a verse marker is noise from the markup.
  for (const b of blocks) {
    const lists = b.t === "q" ? b.lines.map((l) => l.items) : b.t === "p" || b.t === "d" ? [b.items] : [];
    for (const l of lists) for (let i = 0; i < l.length; i++) if (typeof l[i] === "string") l[i] = (l[i] as string).replace(/\s+/g, " ");
  }
  return blocks;
}
