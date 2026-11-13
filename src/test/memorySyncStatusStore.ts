import type { SyncStatusRow } from "../store/syncStatusStore";

// An in-memory stand-in for src/store/syncStatusStore.ts. Tests that run the sync scheduler under
// fake timers use it, because real database I/O does not advance with a fake clock.
// Usage: vi.mock("../store/syncStatusStore", () => import("../test/memorySyncStatusStore"));
let row: SyncStatusRow | null = null;

export async function getSyncStatusRow(): Promise<SyncStatusRow | null> {
  return row && { ...row };
}

export async function saveSyncStatusFields(fields: Partial<SyncStatusRow>): Promise<void> {
  row = { lastAttemptAt: null, lastSuccessAt: null, lastError: null, ...row, ...fields };
}

export async function clearSyncStatusRow(): Promise<void> {
  row = null;
}
