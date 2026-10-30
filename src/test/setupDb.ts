import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

// Every test file gets its own empty SQLite database, created before the file's
// imports load the Prisma client, so tests never read or write data/tracker.db (D-022).
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "mlb-tracker-test-"));
process.env.DATABASE_URL = `file:${path.join(dbDir, "test.db")}`;
execSync("npx prisma db push --skip-generate", { env: process.env, stdio: "ignore" });

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});
