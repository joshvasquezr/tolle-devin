// D§6.1 step 2. Static output only; the Worker (P1.8/P2.1) handles verse, alias and API paths.
import { writeFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import { headersFile } from "./src/csp.ts";

/** Writes dist/_headers with the CSP hash of the inline boot script (P1.4, D§8). */
const securityHeaders = {
  name: "security-headers",
  hooks: {
    "astro:build:done": ({ dir }) => writeFileSync(new URL("_headers", dir), headersFile()),
  },
};

export default defineConfig({
  // SPEC §14 Q1: the production domain is not chosen yet; canonical/OG URLs use SITE_URL.
  site: process.env.SITE_URL ?? "http://localhost:4321",
  output: "static",
  trailingSlash: "never",
  build: { format: "directory", inlineStylesheets: "never" },
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [securityHeaders],
});
