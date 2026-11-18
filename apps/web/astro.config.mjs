// D§6.1 step 2. Static output only; the Worker (P1.8/P2.1) handles verse, alias and API paths.
import { defineConfig } from "astro/config";

export default defineConfig({
  // SPEC §14 Q1: the production domain is not chosen yet; canonical/OG URLs use SITE_URL.
  site: process.env.SITE_URL ?? "http://localhost:4321",
  output: "static",
  trailingSlash: "never",
  build: { format: "directory", inlineStylesheets: "never" },
  compressHTML: true,
  devToolbar: { enabled: false },
});
