import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The other tests build their schema with `prisma db push`. This one applies the committed
// migrations (what production gets from `npm run db:migrate`) to an empty schema, checks it has the
// same tables and columns as the db-push schema from setupDb.ts, and runs real store queries on it.
const baseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54330/mlb_tracker_test";
const pushedSchema = new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
const migratedSchema = `test_mig_${randomBytes(6).toString("hex")}`;
const migratedUrl = (() => {
  const u = new URL(baseUrl);
  u.searchParams.set("schema", migratedSchema);
  return u.toString();
})();

const admin = new PrismaClient({ datasourceUrl: baseUrl });

async function columns(schema: string) {
  const rows = await admin.$queryRaw<{ t: string; c: string; type: string; nullable: string; def: string | null }[]>`
    SELECT table_name AS t, column_name AS c, data_type AS type, is_nullable AS nullable, column_default AS def
    FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name <> '_prisma_migrations'
    ORDER BY table_name, column_name`;
  // Serial defaults embed the sequence name, which differs per schema only by the schema prefix.
  return rows.map((r) => ({ ...r, def: r.def?.replace(/nextval\('.*?'::regclass\)/, "nextval") ?? null }));
}

beforeAll(() => {
  // Prisma creates the schema from ?schema= if it does not exist, then applies prisma/migrations/*.
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: migratedUrl, DIRECT_URL: migratedUrl },
    stdio: "ignore",
  });
});

afterAll(async () => {
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${migratedSchema}" CASCADE`);
  await admin.$disconnect();
});

describe("prisma/migrations", () => {
  it("produce the same tables and columns as the schema.prisma push", async () => {
    const migrated = await columns(migratedSchema);
    expect(migrated.length).toBeGreaterThan(0);
    expect(migrated).toEqual(await columns(pushedSchema));
  });

  it("support the store queries on a migrated schema", async () => {
    process.env.DATABASE_URL = migratedUrl;
    process.env.DIRECT_URL = migratedUrl;
    // Dynamic import: the Prisma singleton must be created after DATABASE_URL points at the migrated schema.
    const { prisma } = await import("../db/prisma");
    const { upsertPlayer, getDashboardData } = await import("../store/playerStore");
    try {
      await upsertPlayer({ mlbId: 42, name: "Migrated Player", position: "SS", war: 1.5, birthDate: new Date("1995-03-04") });
      const dashboard = await getDashboardData([42]);
      expect(dashboard).toHaveLength(1);
      expect(dashboard[0].player).toMatchObject({ mlbId: 42, name: "Migrated Player", war: 1.5 });
      const row = await prisma.player.findUniqueOrThrow({ where: { mlbId: 42 } });
      expect(row.birthDate?.toISOString()).toBe("1995-03-04T00:00:00.000Z");
    } finally {
      await prisma.$disconnect();
    }
  });
});
