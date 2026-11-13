// The one place that records how the sync is doing (D-032, D-037). The record lives in the
// database (one SyncStatus row) so a cron run and a later request on another process agree.
// Only `scheduled` is per process: it says whether this process runs the 24h timer.
import { clearSyncStatusRow, getSyncStatusRow, saveSyncStatusFields, type SyncStatusRow } from "../store/syncStatusStore";

export type SyncStatus = {
  /** True on Vercel (the cron is the schedule) or once this process has started the 24h timer. */
  scheduled: boolean;
  /** Last time a sync (or the config load before it) was tried. ISO string. */
  lastAttemptAt: string | null;
  /** Last time a full sync cycle finished without error. ISO string. */
  lastSuccessAt: string | null;
  /** Message from the most recent failure (at most 300 characters); cleared by the next success. */
  lastError: string | null;
  /** True when scheduled, the last attempt did not fail, and the last success is under 48 hours old. */
  ok: boolean;
};

/** A success older than this means the sync has stopped, even if nothing reported an error. */
export const staleAfterMs = 48 * 60 * 60 * 1000;
/** The status endpoint is public, so a stored error is cut to this length (D-037). */
export const maxErrorLength = 300;

let timerStarted = false;

export function markSyncScheduled(scheduled: boolean): void {
  timerStarted = scheduled;
}

// A failed status write must never break a sync or a request: log it and carry on.
async function save(fields: Partial<SyncStatusRow>): Promise<void> {
  try {
    await saveSyncStatusFields(fields);
  } catch (err) {
    console.error("Could not record sync status:", err);
  }
}

export async function markSyncAttempt(now: Date = new Date()): Promise<void> {
  await save({ lastAttemptAt: now });
}

export async function markSyncSuccess(now: Date = new Date()): Promise<void> {
  await save({ lastSuccessAt: now, lastError: null });
}

export async function markSyncFailure(err: unknown, now: Date = new Date()): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Recording sync failure:", err); // the full error goes to the logs; only a cut copy is stored
  await save({ lastAttemptAt: now, lastError: message.slice(0, maxErrorLength) });
}

/** Reads the stored row; throws if the database cannot be read. `now` is injectable for tests. */
export async function getSyncStatus(now: Date = new Date()): Promise<SyncStatus> {
  const row = await getSyncStatusRow();
  const lastAttemptAt = row?.lastAttemptAt ?? null;
  const lastSuccessAt = row?.lastSuccessAt ?? null;
  const lastError = row?.lastError ?? null;
  const scheduled = Boolean(process.env.VERCEL) || timerStarted;
  const fresh = lastSuccessAt !== null && now.getTime() - lastSuccessAt.getTime() < staleAfterMs;
  return {
    scheduled,
    lastAttemptAt: lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
    lastError,
    ok: scheduled && lastError === null && fresh,
  };
}

/** For tests: clear the stored row and this process's timer flag. */
export async function resetSyncStatus(): Promise<void> {
  timerStarted = false;
  await clearSyncStatusRow();
}
