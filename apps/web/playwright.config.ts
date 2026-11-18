import { defineConfig } from "@playwright/test";

// Default server is `wrangler dev` over dist/: Static Assets + the Worker (verse URLs, 404) + _headers CSP,
// as in production. E2E_BASE_URL points the suite at another server.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: external ?? "http://localhost:4322" },
  ...(external
    ? {}
    : { webServer: { command: "pnpm --filter @tolle/worker exec wrangler dev --local --port 4322", url: "http://localhost:4322/bsb/john/3", reuseExistingServer: true, timeout: 60_000 } }),
});
