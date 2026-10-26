import { prisma } from "../db/prisma";
import type { PlayerConfig } from "../config/loadPlayers";

const mlbAPIBase = "https://statsapi.mlb.com/api/v1";
const requestDelayMs = 200;
const contractWatchIntervalMs = 30 * 60 * 1000;

interface Transaction {
  id: number;
  toTeam: { id: number; name: string } | null;
  date: string;
  typeCode: string;
  typeDesc: string;
  description: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB API returned ${res.status}`);
  return (await res.json()) as T;
}

async function fetchFATransactions(mlbId: number): Promise<Transaction[]> {
  const url = `${mlbAPIBase}/transactions?playerId=${mlbId}&type=FA`;
  const resp = await getJSON<TransactionsResponse>(url);
  return resp.transactions ?? [];
}

export async function runContractWatch(players: PlayerConfig[]): Promise<void> {
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (i > 0) await new Promise((r) => setTimeout(r, requestDelayMs));

    const player = await prisma.player.findUnique({ where: { mlbId: p.mlb_id } });
    if (!player) continue;
    if (player.status !== "unsigned") continue;

    const existing = await prisma.contract.findFirst({
      where: { playerId: player.id },
      orderBy: { createdAt: "desc" },
    });
    if (existing) continue;

    const transactions = await fetchFATransactions(p.mlb_id);
    const latest = transactions[0];
    if (!latest || !latest.toTeam) continue;

    await prisma.contract.create({
      data: {
        playerId: player.id,
        team: latest.toTeam.name,
        years: null,
        totalValue: null,
        aav: null,
        signedDate: latest.date ? new Date(latest.date) : null,
      },
    });

    await prisma.player.update({
      where: { id: player.id },
      data: { status: "signed" },
    });

    console.log(`Signed: ${p.name} to ${latest.toTeam.name} on ${latest.date}`);
  }
}

export function startContractWatcher(players: PlayerConfig[], intervalMs: number = contractWatchIntervalMs) {
  // Run once on start, then on interval (mirrors Go ticker + initial run).
  void runContractWatch(players);
  const timer = setInterval(() => {
    void runContractWatch(players);
  }, intervalMs);
  // Don't hold the event loop open just for the timer handle in tests.
  if (typeof timer.unref === "function") timer.unref();
}
