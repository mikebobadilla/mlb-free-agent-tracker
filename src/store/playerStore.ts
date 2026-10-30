import { prisma } from "../db/prisma";
import type { ContractConfig } from "../config/loadPlayers";
import { contractExpiry, pickCurrentContract, statusFor } from "../contracts";
import type { PlayerDashboard, Prediction } from "../models";

export interface PlayerRecordInput {
  mlbId: number;
  name: string;
  position: string;
  age?: number | null;
  prevTeam?: string | null;
  retroId?: string | null;
  birthDate?: Date | null;
  war?: number | null;
  season?: number | null;
  obp?: number | null;
  slg?: number | null;
  ops?: number | null;
  era?: number | null;
  whip?: number | null;
  ip?: number | null;
  k9?: number | null;
  fip?: number | null;
}

export async function upsertPlayer(input: PlayerRecordInput) {
  // Synced fields only. status and contractExpiry are owned by refreshContractState
  // and must survive a sync (D-011, D-025).
  const synced = {
    name: input.name,
    position: input.position,
    age: input.age ?? null,
    prevTeam: input.prevTeam ?? null,
    retroId: input.retroId ?? null,
    birthDate: input.birthDate ?? null,
    war: input.war ?? null,
    season: input.season ?? null,
    obp: input.obp ?? null,
    slg: input.slg ?? null,
    ops: input.ops ?? null,
    era: input.era ?? null,
    whip: input.whip ?? null,
    ip: input.ip ?? null,
    k9: input.k9 ?? null,
    fip: input.fip ?? null,
  };
  return prisma.player.upsert({
    where: { mlbId: input.mlbId },
    create: { mlbId: input.mlbId, ...synced },
    update: synced,
  });
}

/** Cached Chadwick ids for players that already have both a Retrosheet id and a birth date. */
export async function getKnownPlayerIds(mlbIds: number[]): Promise<Map<number, { retroId: string; birthDate: Date }>> {
  const rows = await prisma.player.findMany({
    where: { mlbId: { in: mlbIds }, retroId: { not: null }, birthDate: { not: null } },
    select: { mlbId: true, retroId: true, birthDate: true },
  });
  return new Map(rows.map((r) => [r.mlbId, { retroId: r.retroId!, birthDate: r.birthDate! }]));
}

export async function getPlayerByMlbId(mlbId: number) {
  return prisma.player.findUnique({ where: { mlbId } });
}

/** Replace the player's curated contract with the one from players.yaml, or remove it (D-024). */
export async function saveCuratedContract(mlbId: number, c: ContractConfig | undefined) {
  const player = await prisma.player.findUnique({ where: { mlbId } });
  if (!player) return;
  const existing = await prisma.contract.findFirst({ where: { playerId: player.id, origin: "curated" } });
  if (!c) {
    if (existing) await prisma.contract.delete({ where: { id: existing.id } });
    return;
  }
  const data = {
    team: c.team,
    years: c.years,
    totalValue: c.total,
    aav: c.total / c.years,
    firstSeason: c.first_season,
    optedOutAfter: c.opted_out_after ?? null,
    signedDate: new Date(c.signed),
    notes: c.notes ?? null,
    source: c.source,
  };
  if (existing) {
    await prisma.contract.update({ where: { id: existing.id }, data });
  } else {
    await prisma.contract.create({ data: { ...data, playerId: player.id, origin: "curated" } });
  }
}

/** Record an MLB "signed free agent" transaction once, keyed by its transaction id. */
export async function saveTransactionSigning(
  mlbId: number,
  t: { transactionId: number; team: string; date: string },
) {
  const player = await prisma.player.findUnique({ where: { mlbId } });
  if (!player) return;
  await prisma.contract.upsert({
    where: { transactionId: t.transactionId },
    create: { playerId: player.id, team: t.team, signedDate: new Date(t.date), transactionId: t.transactionId },
    update: {},
  });
}

/** Recompute status and contractExpiry from the player's current contract (D-025). */
export async function refreshContractState(mlbId: number, today: Date = new Date()) {
  const player = await prisma.player.findUnique({ where: { mlbId }, include: { contracts: true } });
  if (!player) return;
  const current = pickCurrentContract(player.contracts);
  await prisma.player.update({
    where: { id: player.id },
    data: { status: statusFor(current, today), contractExpiry: contractExpiry(current) },
  });
}

/** Delete players (and their contracts, rumors, predictions) that are no longer in players.yaml. */
export async function removeUntrackedPlayers(trackedMlbIds: number[]) {
  const stale = await prisma.player.findMany({ where: { mlbId: { notIn: trackedMlbIds } }, select: { id: true } });
  const ids = stale.map((p) => p.id);
  if (ids.length === 0) return;
  await prisma.$transaction([
    prisma.contract.deleteMany({ where: { playerId: { in: ids } } }),
    prisma.rumor.deleteMany({ where: { playerId: { in: ids } } }),
    prisma.prediction.deleteMany({ where: { playerId: { in: ids } } }),
    prisma.player.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

export async function getDashboardData(mlbIds?: number[]): Promise<PlayerDashboard[]> {
  const where = mlbIds && mlbIds.length > 0 ? { mlbId: { in: mlbIds } } : undefined;
  const players = await prisma.player.findMany({
    where,
    include: { contracts: true, rumors: true, predictions: true },
  });
  const result: PlayerDashboard[] = [];
  for (const p of players) {
    const { contracts, rumors, predictions, ...player } = p;
    const contract = pickCurrentContract(contracts);
    result.push({
      player: { ...player, updatedAt: player.updatedAt.toISOString() },
      contract: contract
        ? {
            ...contract,
            signedDate: contract.signedDate ? contract.signedDate.toISOString().slice(0, 10) : null,
            createdAt: contract.createdAt.toISOString(),
          }
        : null,
      rumors: rumors.map((r) => ({
        ...r,
        datePosted: r.datePosted ? r.datePosted.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
      prediction: predictions.length > 0 ? (predictions[0] as unknown as Prediction) : null,
    });
  }
  return result;
}
