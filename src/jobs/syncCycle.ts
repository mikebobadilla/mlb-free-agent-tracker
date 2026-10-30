import type { PlayerConfig } from "../config/loadPlayers";
import { runContractWatch } from "./contractWatcher";
import { syncCuratedContracts } from "./curatedContracts";
import { runStatsSync } from "./statsSync";

const syncIntervalMs = 24 * 60 * 60 * 1000;

/** Retrosheet stats, then curated contracts, then this offseason's MLB signings (D-027). */
export async function runSyncCycle(players: PlayerConfig[], today: Date = new Date()): Promise<void> {
  await runStatsSync(players, today);
  await syncCuratedContracts(players, today);
  await runContractWatch(players, today);
}

// Sync once, then once a day. A failed scheduled run is logged and the next one
// still happens; the initial run's error goes to the caller.
export async function startNightlySync(players: PlayerConfig[], intervalMs: number = syncIntervalMs): Promise<void> {
  await runSyncCycle(players);
  const timer = setInterval(() => {
    runSyncCycle(players).catch((err) => console.error("Sync failed:", err));
  }, intervalMs);
  timer.unref();
}
