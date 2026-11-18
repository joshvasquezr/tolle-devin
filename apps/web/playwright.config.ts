import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:4322" },
  webServer: { command: "pnpm preview --port 4322", url: "http://localhost:4322/bsb/john/3", reuseExistingServer: true },
});
