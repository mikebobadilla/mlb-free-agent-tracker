import type { PlayerConfig } from "../config/loadPlayers";
import { refreshContractState, removeUntrackedPlayers, saveCuratedContract } from "../store/playerStore";

/** Apply players.yaml to the database: drop untracked players, store curated contracts, refresh status. */
export async function syncCuratedContracts(players: PlayerConfig[], today: Date = new Date()): Promise<void> {
  await removeUntrackedPlayers(players.map((p) => p.mlb_id));
  for (const p of players) {
    await saveCuratedContract(p.mlb_id, p.contract);
    await refreshContractState(p.mlb_id, today);
  }
}
