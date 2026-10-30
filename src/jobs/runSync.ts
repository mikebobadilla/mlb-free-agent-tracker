import { loadPlayers } from "../config/loadPlayers";
import { runStatsSync } from "./statsSync";
import { runContractWatch } from "./contractWatcher";
import { syncCuratedContracts } from "./curatedContracts";

async function main() {
  const players = await loadPlayers();
  await runStatsSync(players);
  await syncCuratedContracts(players);
  await runContractWatch(players);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
