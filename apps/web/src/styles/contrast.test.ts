// D§5.1 / SPEC §6.3, WCAG 2.2 AA: every text/background and text/tint pair in both modes.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const typeCss = readFileSync(new URL("./type.css", import.meta.url), "utf8");

type Rgba = [number, number, number, number];

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

function parse(v: string): Rgba {
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  m = v.match(/^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  throw new Error(`unparsed color ${v}`);
}

const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const lum = ([r, g, b]: Rgba) => {
  const c = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const ratio = (a: Rgba, b: Rgba) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const light = block(":root");
const modes = {
  light,
  dark: { ...light, ...block(':root[data-theme="dark"]') },
  "system dark": { ...light, ...block(":root:not([data-theme])") },
};
const TEXT = ["--text", "--text-2", "--text-3"];
const SURFACES = ["--bg", "--surface", "--hover"];
const TINTS = ["--hl-sand", "--hl-sage", "--hl-slate", "--hl-rose"];
// Verse numbers use --text-3 except inside highlights, where type.css switches them to --text-2.
const TEXT_ON_TINT = ["--text", "--text-2"];

describe.each(Object.entries(modes))("contrast: %s", (_mode, t) => {
  const c = (name: string) => parse(t[name]!);
  const bg = c("--bg");

  // --text-3 is the verse-number grey (SPEC §6.3); it only ever sits on --bg (see the usage test below).
  const pairs = TEXT.flatMap((f) => SURFACES.map((s) => [f, s])).filter(([f, s]) => f !== "--text-3" || s === "--bg");
  it.each(pairs)("%s on %s ≥ 4.5:1", (f, s) => {
    expect(ratio(c(f!), over(c(s!), bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TEXT_ON_TINT.flatMap((f) => TINTS.map((s) => [f, s])))("%s on %s (blended over --bg) ≥ 4.5:1", (f, s) => {
    expect(ratio(c(f!), over(c(s!), bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("focus ring and input border (--text-3) ≥ 3:1 against --bg and --surface", () => {
    for (const s of ["--bg", "--surface"]) {
      expect(ratio(c("--focus"), c(s))).toBeGreaterThanOrEqual(3);
      expect(ratio(c("--text-3"), c(s))).toBeGreaterThanOrEqual(3);
    }
  });

  it("tints stay distinguishable from --bg only as decoration (no text uses --text-3 on them)", () => {
    expect(typeCss).toMatch(/\[data-hl\] \.vn \{ color: var\(--text-2\); \}/);
  });
});

it("system-dark block equals the explicit dark block", () => {
  expect(block(":root:not([data-theme])")).toEqual({ ...block(':root[data-theme="dark"]') });
});

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (/\.(css|astro)$/.test(e.name)) yield p;
  }
}

it("--text-3 is used as text color only for verse numbers (it fails 4.5:1 on --hover/--surface)", () => {
  const offenders: string[] = [];
  for (const file of sources(new URL("..", import.meta.url).pathname)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/([^{}]+)\{[^}]*(?<![-\w])color:\s*var\(--text-3\)/g)) {
      const sel = m[1]!.trim().split("\n").at(-1)!;
      if (!/\.vn\b/.test(sel)) offenders.push(`${file}: ${sel}`);
    }
  }
  expect(offenders).toEqual([]);
});
