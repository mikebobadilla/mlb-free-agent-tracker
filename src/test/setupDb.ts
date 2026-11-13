import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll } from "vitest";

// Every test file gets its own throwaway Postgres schema, created before the file's imports
// load the Prisma client and dropped in afterAll, so tests never read or write the dev
// database's tables (D-022, D-034). Only this setup file runs raw SQL.
const baseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54330/mlb_tracker_test";
const schema = `test_${randomBytes(6).toString("hex")}`;

const url = new URL(baseUrl);
url.searchParams.set("schema", schema);
const schemaUrl = url.toString();

// Connect to the bare database first so a stopped container gives one clear line, not a Prisma stack.
const probe = new PrismaClient({ datasourceUrl: baseUrl });
try {
  await probe.$queryRawUnsafe("SELECT 1");
} catch {
  throw new Error(
    `Cannot connect to Postgres at ${url.hostname}:${url.port || 5432} for the tests. Run \`npm run db:up\` first.`,
  );
} finally {
  await probe.$disconnect();
}

process.env.DATABASE_URL = schemaUrl;
process.env.DIRECT_URL = schemaUrl;
execSync("npx prisma db push --skip-generate", { env: process.env, stdio: "ignore" });

afterAll(async () => {
  const admin = new PrismaClient({ datasourceUrl: baseUrl });
  try {
    // `schema` is `test_` plus hex, generated above, so it is safe to inline.
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});
