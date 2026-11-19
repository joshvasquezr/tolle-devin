// D§6.1 step 2. Static output only; the Worker (P1.8/P2.1) handles verse, alias and API paths.
import { readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { defineConfig } from "astro/config";
import { headersFile } from "./src/csp.ts";

/** Writes dist/_headers with the CSP hash of the inline boot script (P1.4, D§8). */
const securityHeaders = {
  name: "security-headers",
  hooks: {
    "astro:build:done": ({ dir }) => writeFileSync(new URL("_headers", dir), headersFile()),
  },
};

/** D§3.13: bundles src/sw.ts → dist/sw.js with this build's hashed asset list (P3.5). */
const serviceWorker = {
  name: "service-worker",
  hooks: {
    "astro:build:done": ({ dir }) => {
      const files = (sub) => readdirSync(new URL(sub, dir)).map((f) => `/${sub}${f}`);
      const precache = [...files("_astro/"), ...files("fonts/").filter((f) => f.endsWith(".woff2"))].sort();
      const build = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 10);
      buildSync({
        entryPoints: [fileURLToPath(new URL("./src/sw.ts", import.meta.url))],
        outfile: fileURLToPath(new URL("sw.js", dir)),
        bundle: true, minify: true, format: "iife", target: "es2022",
        define: { __BUILD__: JSON.stringify(build), __PRECACHE__: JSON.stringify(precache) },
      });
    },
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
  integrations: [securityHeaders, serviceWorker],
});
