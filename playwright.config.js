import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120000,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:8080", trace: "retain-on-failure" },
  webServer: {
    command: "python3 -m http.server 8080",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
    {
      name: "iphone-webkit",
      use: {
        browserName: "webkit",
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
