import type { PlayerConfig } from "../config/loadPlayers";
import { runContractWatch } from "./contractWatcher";
import { syncCuratedContracts } from "./curatedContracts";
import { runStatsSync } from "./statsSync";
import { markSyncAttempt, markSyncFailure, markSyncScheduled, markSyncSuccess } from "./syncStatus";

const syncIntervalMs = 24 * 60 * 60 * 1000;

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

// Sync once, then once a day. A failed run, initial or scheduled, is logged and the
// timer keeps going, so an upstream outage at boot doesn't stop the daily sync (D-031).
// The timer starts before the first run so the status reads "scheduled" while it is in flight.
export async function startNightlySync(players: PlayerConfig[], intervalMs: number = syncIntervalMs): Promise<void> {
  const timer = setInterval(() => {
    runSyncCycle(players).catch((err) => console.error("Sync failed:", err));
  }, intervalMs);
  timer.unref();
  markSyncScheduled(true);
  try {
    await runSyncCycle(players);
  } catch (err) {
    console.error("Initial sync failed:", err);
  }
}
