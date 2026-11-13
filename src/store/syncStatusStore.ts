import { prisma } from "../db/prisma";

// The sync status is one row with id 1 (D-037). The rules live in src/jobs/syncStatus.ts.
const ROW_ID = 1;

export type SyncStatusRow = {
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
};

/** The stored row, or null before the first sync has recorded anything. */
export async function getSyncStatusRow(): Promise<SyncStatusRow | null> {
  const row = await prisma.syncStatus.findUnique({ where: { id: ROW_ID } });
  return row && { lastAttemptAt: row.lastAttemptAt, lastSuccessAt: row.lastSuccessAt, lastError: row.lastError };
}

/** Creates the row if needed and sets only the fields given; the others keep their value. */
export async function saveSyncStatusFields(fields: Partial<SyncStatusRow>): Promise<void> {
  await prisma.syncStatus.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, ...fields },
    update: fields,
  });
}

/** For tests: forget everything that was recorded. */
export async function clearSyncStatusRow(): Promise<void> {
  await prisma.syncStatus.deleteMany({});
}
