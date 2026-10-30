import type { PlayerConfig } from "../config/loadPlayers";
import { upcomingSeason } from "../contracts";
import { refreshContractState, saveTransactionSigning } from "../store/playerStore";

const mlbAPIBase = "https://statsapi.mlb.com/api/v1";
const requestDelayMs = 200;
const contractWatchIntervalMs = 30 * 60 * 1000;

interface Transaction {
  id: number;
  toTeam?: { id: number; name: string } | null;
  date?: string;
  typeCode: string;
}

interface TransactionsResponse {
  transactions?: Transaction[];
}

/** Oct 1 that opened the offseason for the upcoming season (D-025). */
export function offseasonStart(today: Date): string {
  return `${upcomingSeason(today) - 1}-10-01`;
}

async function fetchSignings(mlbId: number, today: Date): Promise<Transaction[]> {
  const url =
    `${mlbAPIBase}/transactions?playerId=${mlbId}` +
    `&startDate=${offseasonStart(today)}&endDate=${today.toISOString().slice(0, 10)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB API returned ${res.status}`);
  const body = (await res.json()) as TransactionsResponse;
  // SFA = "Signed as Free Agent". DFA here means "Declared Free Agency", not a signing.
  return (body.transactions ?? []).filter((t) => t.typeCode === "SFA" && t.toTeam && t.date);
}

/**
 * Records this offseason's signings as contracts without terms, then refreshes status.
 * Terms come from players.yaml (D-024); one player's failure doesn't stop the rest.
 */
export async function runContractWatch(players: PlayerConfig[], today: Date = new Date()): Promise<void> {
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (i > 0) await new Promise((r) => setTimeout(r, requestDelayMs));
    try {
      for (const t of await fetchSignings(p.mlb_id, today)) {
        await saveTransactionSigning(p.mlb_id, { transactionId: t.id, team: t.toTeam!.name, date: t.date! });
      }
      await refreshContractState(p.mlb_id, today);
    } catch (err) {
      console.warn(`Contract watch failed for ${p.name}:`, err);
    }
  }
}

export function startContractWatcher(players: PlayerConfig[], intervalMs: number = contractWatchIntervalMs) {
  const run = () => runContractWatch(players).catch((err) => console.error("Contract watch failed:", err));
  void run();
  setInterval(run, intervalMs).unref();
}
