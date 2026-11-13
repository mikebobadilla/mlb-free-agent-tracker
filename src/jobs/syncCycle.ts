import { loadPlayers, type PlayerConfig } from "../config/loadPlayers";
import { runContractWatch } from "./contractWatcher";
import { syncCuratedContracts } from "./curatedContracts";
import { runStatsSync } from "./statsSync";
import { markSyncAttempt, markSyncFailure, markSyncScheduled, markSyncSuccess } from "./syncStatus";

const syncIntervalMs = 24 * 60 * 60 * 1000;

/** First retry after a failure; doubles on each further failure up to the cap (D-033). */
export const retryBaseMs = 15 * 60 * 1000;
export const retryMaxMs = 60 * 60 * 1000;

export function retryDelayMs(consecutiveFailures: number): number {
  return Math.min(retryBaseMs * 2 ** (consecutiveFailures - 1), retryMaxMs);
}

/** Retrosheet stats, then curated contracts, then this offseason's MLB signings (D-027). */
export async function runSyncCycle(players: PlayerConfig[], today: Date = new Date()): Promise<void> {
  markSyncAttempt();
  try {
    await runStatsSync(players, today);
    await syncCuratedContracts(players, today);
    await runContractWatch(players, today);
  } catch (err) {
    markSyncFailure(err);
    throw err;
  }
  markSyncSuccess();
}

export type ScheduleOptions = {
  /** Called on every attempt, so a fixed players.yaml is picked up without a restart. */
  load?: () => Promise<PlayerConfig[]>;
  intervalMs?: number;
};

// Sync once, then once a day. Every attempt re-reads players.yaml. A failed attempt (config or
// sync, initial or scheduled) is logged and retried after 15 min, doubling to a 1 h cap, until
// one succeeds; then the daily cadence resumes (D-031, D-033). Attempts are chained, so they
// never overlap. The next attempt is always pending, so the status reads "scheduled" throughout.
// Resolves after the first attempt and never rejects.
export async function startNightlySync(opts: ScheduleOptions = {}): Promise<void> {
  const load = opts.load ?? loadPlayers;
  const intervalMs = opts.intervalMs ?? syncIntervalMs;
  let failures = 0;
  let first = true;

  const attempt = async (): Promise<void> => {
    let failed = false;
    try {
      let players: PlayerConfig[];
      try {
        players = await load();
      } catch (err) {
        markSyncFailure(err); // runSyncCycle records its own failures
        throw err;
      }
      await runSyncCycle(players);
    } catch (err) {
      failed = true;
      console.error(first ? "Initial sync failed:" : "Sync failed:", err);
    }
    first = false;
    failures = failed ? failures + 1 : 0;
    const timer = setTimeout(() => void attempt(), failed ? retryDelayMs(failures) : intervalMs);
    timer.unref();
  };

  markSyncScheduled(true);
  await attempt();
}
