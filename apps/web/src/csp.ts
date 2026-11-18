// D§8 CSP. The inline boot script is allowed by hash, computed from the exact bytes served.
import { createHash } from "node:crypto";
import { BOOT_SCRIPT } from "./scripts/settings-core.ts";

export const bootHash = (): string => `'sha256-${createHash("sha256").update(BOOT_SCRIPT).digest("base64")}'`;

export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${bootHash()}`,
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
  return `/*\n  Content-Security-Policy: ${contentSecurityPolicy()}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`;
}
