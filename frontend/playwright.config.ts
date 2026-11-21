import { randomBytes, randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

const database = process.env.FRIDGELLIO_E2E_DATABASE_URL;
if (!database)
  throw new Error(
    "Set FRIDGELLIO_E2E_DATABASE_URL to a disposable PostgreSQL database.",
  );
// The test workers and FastAPI must inspect the same disposable schema.
process.env.FRIDGELLIO_E2E_RUN_ID ??= randomUUID();
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3310",
    actionTimeout: 10000,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: [
    {
      command: ".venv/bin/python ../frontend/e2e/serve_api.py",
      cwd: "../backend",
      env: { FRIDGELLIO_E2E_DATABASE_URL: database, PYTHONPATH: "." },
      gracefulShutdown: { signal: "SIGINT", timeout: 10000 },
      url: "http://127.0.0.1:8310/health/ready",
      reuseExistingServer: false,
    },
    {
      command: "pnpm start --hostname 127.0.0.1 --port 3310",
      env: {
        FRIDGELLIO_API_URL: "http://127.0.0.1:8310",
        NEXTAUTH_URL: "http://127.0.0.1:3310",
        NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
      },
      url: "http://127.0.0.1:3310",
      reuseExistingServer: false,
    },
  ],
});
