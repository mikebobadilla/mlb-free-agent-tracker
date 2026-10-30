import { loadPlayers } from "../config/loadPlayers";
import { runSyncCycle } from "./syncCycle";

async function main() {
  await runSyncCycle(await loadPlayers());
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
