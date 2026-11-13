import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPlayers } from "../config/loadPlayers";
import { prisma } from "../db/prisma";
import { syncCuratedContracts } from "../jobs/curatedContracts";
import { removeUntrackedPlayers, upsertPlayer } from "./playerStore";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("upsertPlayer", () => {
  it("keeps status and contract expiry when stats are re-synced", async () => {
    const created = await upsertPlayer({ mlbId: 1, name: "Test Player", position: "SS", war: 1 });
    await prisma.player.update({ where: { id: created.id }, data: { status: "signed", contractExpiry: 2026 } });

    await upsertPlayer({ mlbId: 1, name: "Test Player", position: "SS", war: 2.5 });

    const after = await prisma.player.findUniqueOrThrow({ where: { id: created.id } });
    expect(after).toMatchObject({ status: "signed", contractExpiry: 2026, war: 2.5 });
  });
});

async function seed() {
  for (const mlbId of [1, 2]) {
    const p = await upsertPlayer({ mlbId, name: `Player ${mlbId}`, position: "SS" });
    await prisma.contract.create({ data: { playerId: p.id, team: "Padres", signedDate: new Date("2025-12-19") } });
    await prisma.rumor.create({ data: { playerId: p.id } });
    await prisma.prediction.create({ data: { playerId: p.id } });
  }
}

const counts = async () => ({
  players: await prisma.player.count(),
  contracts: await prisma.contract.count(),
  rumors: await prisma.rumor.count(),
  predictions: await prisma.prediction.count(),
});

function writeConfig(yaml: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "players-")), "players.yaml");
  fs.writeFileSync(file, yaml);
  return file;
}

describe("removeUntrackedPlayers", () => {
  beforeEach(async () => {
    await prisma.prediction.deleteMany();
    await prisma.rumor.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.player.deleteMany();
    await seed();
  });

  it("deletes players missing from the tracked list, with their related rows", async () => {
    await removeUntrackedPlayers([1]);
    expect(await counts()).toEqual({ players: 1, contracts: 1, rumors: 1, predictions: 1 });
    expect((await prisma.player.findFirstOrThrow()).mlbId).toBe(1);
  });

  it("refuses to delete anything when the tracked list is empty, and logs an error", async () => {
    const before = await counts();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await removeUntrackedPlayers([]);
    expect(await counts()).toEqual(before);
    expect(before).toEqual({ players: 2, contracts: 2, rumors: 2, predictions: 2 });
    expect(err).toHaveBeenCalledOnce();
    err.mockRestore();
  });

  it.each([
    ["an empty file", ""],
    ["the wrong top-level key", "player:\n  - name: Player 1\n    position: SS\n    mlb_id: 1\n"],
    ["players: []", "players: []\n"],
  ])("a sync from %s fails and leaves the database intact", async (_label, yaml) => {
    const before = await counts();
    // Same order as the server and `npm run sync`: load the config, then apply it.
    await expect(loadPlayers(writeConfig(yaml)).then((players) => syncCuratedContracts(players))).rejects.toThrow(
      "`players`",
    );
    expect(await counts()).toEqual(before);
  });

  it("a normal yaml still prunes players that were removed from it", async () => {
    const players = await loadPlayers(writeConfig("players:\n  - name: Player 2\n    position: SS\n    mlb_id: 2\n"));
    await syncCuratedContracts(players);
    const left = await prisma.player.findMany();
    expect(left.map((p) => p.mlbId)).toEqual([2]);
    expect((await counts()).contracts).toBe(1);
  });
});
