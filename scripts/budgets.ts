// P7.2 / SPEC §7: first-load JS ≤ 60 KB gzipped on every page type, measured from the built HTML
// (external module scripts plus inline scripts). LCP/CLS need Lighthouse on a deployed build.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const JS_BUDGET = 60 * 1024;
export const PAGES = ["index.html", "bsb/john/3/index.html", "kjv/psalms/23/index.html", "search/index.html", "about/index.html", "404.html"];

export function firstLoadJs(dist: string, page: string): number {
  const html = readFileSync(join(dist, page), "utf8");
  let bytes = 0;
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="(\/[^"]+\.js)"[^>]*>/g)) bytes += gzipSync(readFileSync(join(dist, m[1]!)), { level: 9 }).length;
  for (const m of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) if (m[1]!.trim()) bytes += gzipSync(m[1]!, { level: 9 }).length;
  return bytes;
}

export function checkBudgets(dist: string): string[] {
  return PAGES.filter((p) => existsSync(join(dist, p))).flatMap((p) => {
    const b = firstLoadJs(dist, p);
    return b > JS_BUDGET ? [`${p}: first-load JS ${b} B gz > ${JS_BUDGET}`] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL("../apps/web/dist", import.meta.url));
  for (const p of PAGES) if (existsSync(join(dist, p))) console.log(`${p}: ${firstLoadJs(dist, p)} B gz`);
  const bad = checkBudgets(dist);
  if (bad.length) {
    console.error(bad.join("\n"));
    process.exit(1);
  }
  console.log("budgets ok");
}
