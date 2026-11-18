import { defineConfig } from "@playwright/test";

// E2E_BASE_URL runs the suite against another server (e.g. `wrangler dev`, which applies _headers/CSP).
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: external ?? "http://localhost:4322" },
  ...(external ? {} : { webServer: { command: "pnpm preview --port 4322", url: "http://localhost:4322/bsb/john/3", reuseExistingServer: true } }),
});
