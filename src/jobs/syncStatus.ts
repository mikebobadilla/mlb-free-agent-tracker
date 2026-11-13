// The one place that records how the sync is doing (D-032). In memory only: it resets on
// restart, which is fine because the server runs a sync at every boot.
export type SyncStatus = {
  /** Whether the 24h sync timer is running. False if players.yaml failed to load at boot. */
  scheduled: boolean;
  /** Last time a sync (or the boot-time config load) was tried. ISO string. */
  lastAttemptAt: string | null;
  /** Last time a full sync cycle finished without error. ISO string. */
  lastSuccessAt: string | null;
  /** Message from the most recent failure; cleared by the next successful cycle. */
  lastError: string | null;
  /** True when the sync is scheduled and the last attempt did not fail. */
  ok: boolean;
};

type State = Omit<SyncStatus, "ok">;

const initial = (): State => ({ scheduled: false, lastAttemptAt: null, lastSuccessAt: null, lastError: null });
let state: State = initial();

export function getSyncStatus(): SyncStatus {
  return { ...state, ok: state.scheduled && state.lastError === null };
}

export function markSyncAttempt(now: Date = new Date()): void {
  state.lastAttemptAt = now.toISOString();
}

export function markSyncSuccess(now: Date = new Date()): void {
  state.lastSuccessAt = now.toISOString();
  state.lastError = null;
}

export function markSyncFailure(err: unknown, now: Date = new Date()): void {
  state.lastAttemptAt = now.toISOString();
  state.lastError = err instanceof Error ? err.message : String(err);
}

export function markSyncScheduled(scheduled: boolean): void {
  state.scheduled = scheduled;
}

/** For tests. */
export function resetSyncStatus(): void {
  state = initial();
}
