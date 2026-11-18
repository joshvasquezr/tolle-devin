// D§8 CSP. The inline boot script is allowed by hash, computed from the exact bytes served.
import { createHash } from "node:crypto";
import { LANDING_SCRIPT } from "./scripts/pos-core.ts";
import { BOOT_SCRIPT } from "./scripts/settings-core.ts";

export const scriptHash = (src: string): string => `'sha256-${createHash("sha256").update(src).digest("base64")}'`;

/** Every inline script the site serves (boot on all pages, landing redirect on `/`). */
export const INLINE_SCRIPTS = [BOOT_SCRIPT, LANDING_SCRIPT] as const;

export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${INLINE_SCRIPTS.map(scriptHash).join(" ")}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

/** Workers Static Assets `_headers` file (applied to asset responses). */
export function headersFile(): string {
  return `/*\n  Content-Security-Policy: ${contentSecurityPolicy()}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/sw.js\n  Cache-Control: no-cache\n/sw-kill.json\n  Cache-Control: no-store\n`;
}
