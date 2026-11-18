// P7.3 / D§9 "Compliance checks" (SPEC §7, AGENTS "No monetization"): the built site has no ad,
// donation or third-party script patterns, and dev-only switches never reach the deploy config.
// ESV-specific checks are P5.8's.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT = /\.(html|js|mjs|css|json|xml|txt|svg|webmanifest)$|^_headers$|^_redirects$/;

export const RULES: { name: string; re: RegExp }[] = [
  { name: "ad network", re: /googlesyndication|doubleclick\.net|adsbygoogle|amazon-adsystem|adservice\.google|carbonads|buysellads|taboola|outbrain/i },
  { name: "donation link", re: /paypal\.(me|com\/donate)|patreon\.com|ko-fi\.com|buymeacoffee\.com|givebutter|liberapay\.com|opencollective\.com|github\.com\/sponsors|href\s*=\s*["'][^"']*donat|>\s*(donate|support us|sponsor us)\s*</i },
  { name: "analytics/tracker", re: /google-analytics\.com|googletagmanager\.com|gtag\(|plausible\.io|segment\.(io|com)|mixpanel|hotjar|clarity\.ms|connect\.facebook\.net|static\.cloudflareinsights\.com/i },
  { name: "third-party script", re: /<script\b[^>]*\bsrc\s*=\s*["']?(https?:)?\/\//i },
  { name: "third-party stylesheet/frame", re: /<(link\b[^>]*rel=["']?stylesheet[^>]*href|iframe\b[^>]*src)\s*=\s*["']?(https?:)?\/\//i },
  { name: "remote import", re: /\bimport\s*\(?\s*["'](https?:)?\/\//i },
];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // Scripture data is checked by the data validators; scanning ~100 MB of verse JSON for words
      // like "donation" would flag Bible text, not monetization.
      if (relative(dir, p) === "data") continue;
      yield* files(p);
    } else if (TEXT.test(name)) yield p;
  }
}

export function checkDist(dist: string): string[] {
  const out: string[] = [];
  for (const f of files(dist)) {
    const text = readFileSync(f, "utf8");
    for (const r of RULES) {
      const m = r.re.exec(text);
      if (m) out.push(`${relative(dist, f)}: ${r.name} (${m[0].slice(0, 60)})`);
    }
  }
  return out;
}

/** Dev-only switches (the Playwright mail sink) must not appear in the deployable Worker config. */
export function checkWorkerConfig(jsonc: string): string[] {
  return /DEV_MAIL/.test(jsonc) ? ["wrangler.jsonc: DEV_MAIL must only be passed to local wrangler dev"] : [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const problems = [...checkDist(join(root, "apps/web/dist")), ...checkWorkerConfig(readFileSync(join(root, "apps/worker/wrangler.jsonc"), "utf8"))];
  if (problems.length) {
    console.error(`compliance: ${problems.length} problem(s)\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log("compliance ok");
}
