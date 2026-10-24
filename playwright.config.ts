import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173", headless: true },
  projects: [
    { name: "bureau", use: { viewport: { width: 1320, height: 1010 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  reporter: [["list"], ["json", { outputFile: "docs/interface-tests.json" }]],
});
