import { prisma } from "../db/prisma";
import type { Contract, Player, PlayerDashboard, Prediction, Rumor } from "../models";

export interface PlayerRecordInput {
  mlbId: number;
  name: string;
  position: string;
  age?: number | null;
  prevTeam?: string | null;
  war?: number | null;
  season?: number | null;
  status?: string;
  contractExpiry?: number | null;
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
  return prisma.player.upsert({
    where: { mlbId: input.mlbId },
    create: {
      mlbId: input.mlbId,
      name: input.name,
      position: input.position,
      age: input.age ?? null,
      prevTeam: input.prevTeam ?? null,
      war: input.war ?? null,
      season: input.season ?? null,
      status: input.status ?? "unsigned",
      contractExpiry: input.contractExpiry ?? null,
      obp: input.obp ?? null,
      slg: input.slg ?? null,
      ops: input.ops ?? null,
      era: input.era ?? null,
      whip: input.whip ?? null,
      ip: input.ip ?? null,
      k9: input.k9 ?? null,
      fip: input.fip ?? null,
    },
    update: {
      name: input.name,
      position: input.position,
      age: input.age ?? null,
      prevTeam: input.prevTeam ?? null,
      war: input.war ?? null,
      season: input.season ?? null,
      status: input.status ?? "unsigned",
      contractExpiry: input.contractExpiry ?? null,
      obp: input.obp ?? null,
      slg: input.slg ?? null,
      ops: input.ops ?? null,
      era: input.era ?? null,
      whip: input.whip ?? null,
      ip: input.ip ?? null,
      k9: input.k9 ?? null,
      fip: input.fip ?? null,
    },
  });
}

export async function getPlayerByMlbId(mlbId: number) {
  return prisma.player.findUnique({ where: { mlbId } });
}

export async function getLatestContract(playerId: number): Promise<Contract | null> {
  const contracts = await prisma.contract.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
  });
  const c = contracts[0];
  if (!c) return null;
  return {
    ...c,
    signedDate: c.signedDate ? c.signedDate.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function saveContract(contract: Omit<Contract, "id" | "createdAt">) {
  const created = await prisma.contract.create({
    data: {
      playerId: contract.playerId,
      team: contract.team,
      years: contract.years,
      totalValue: contract.totalValue,
      aav: contract.aav,
      signedDate: contract.signedDate ? new Date(contract.signedDate) : null,
    },
  });
  return {
    ...created,
    signedDate: created.signedDate ? created.signedDate.toISOString() : null,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function setContractExpiry(playerId: number, year: number) {
  await prisma.player.update({
    where: { id: playerId },
    data: { contractExpiry: year },
  });
}

export async function getDashboardData(playerIds?: number[]): Promise<PlayerDashboard[]> {
  const where = playerIds && playerIds.length > 0 ? { id: { in: playerIds } } : undefined;
  const players = await prisma.player.findMany({
    where,
    include: { contracts: true, rumors: true, predictions: true },
  });
  const result: PlayerDashboard[] = [];
  for (const p of players) {
    result.push({
      player: p as unknown as Player,
      contract: p.contracts.length > 0 ? (p.contracts[0] as unknown as Contract) : null,
      rumors: (p.rumors ?? []).map((r) => ({
        ...r,
        datePosted: r.datePosted ? r.datePosted.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
      prediction: p.predictions.length > 0 ? (p.predictions[0] as unknown as Prediction) : null,
    });
  }
  return result;
}
