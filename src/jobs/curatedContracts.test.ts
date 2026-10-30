import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerConfig } from "../config/loadPlayers";
import { prisma } from "../db/prisma";
import { app } from "../server/index";
import { upsertPlayer } from "../store/playerStore";
import { runContractWatch } from "./contractWatcher";
import { syncCuratedContracts } from "./curatedContracts";

const offseason = new Date("2026-10-29T12:00:00Z");

const king: PlayerConfig = {
  name: "Michael King",
  position: "SP",
  mlb_id: 650633,
  contract: {
    team: "San Diego Padres",
    years: 3,
    total: 75000000,
    first_season: 2026,
    signed: "2025-12-19",
    source: "https://www.mlb.com/news/michael-king-padres-contract",
  },
};

async function dashboard(mlbId: number) {
  const res = await request(app).get(`/api/players/${mlbId}`);
  return res.body;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.contract.deleteMany();
  await prisma.player.deleteMany();
});

describe("syncCuratedContracts", () => {
  it("serves the curated terms, expiry and status", async () => {
    await upsertPlayer({ mlbId: king.mlb_id, name: king.name, position: king.position });
    await syncCuratedContracts([king], offseason);

    const body = await dashboard(king.mlb_id);
    expect(body.contract).toMatchObject({
      team: "San Diego Padres",
      years: 3,
      totalValue: 75000000,
      aav: 25000000,
      signedDate: "2025-12-19",
      source: king.contract!.source,
    });
    expect(body.player).toMatchObject({ status: "signed", contractExpiry: 2028 });
  });

  it("updates the contract in place and frees the player after an opt-out", async () => {
    await upsertPlayer({ mlbId: king.mlb_id, name: king.name, position: king.position });
    await syncCuratedContracts([king], offseason);
    await syncCuratedContracts([{ ...king, contract: { ...king.contract!, opted_out_after: 2026 } }], offseason);

    expect(await prisma.contract.count()).toBe(1);
    const body = await dashboard(king.mlb_id);
    expect(body.player).toMatchObject({ status: "unsigned", contractExpiry: 2026 });
  });

  it("removes players dropped from players.yaml", async () => {
    await upsertPlayer({ mlbId: king.mlb_id, name: king.name, position: king.position });
    await upsertPlayer({ mlbId: 666182, name: "Wrong ID", position: "SS" });
    await syncCuratedContracts([king], offseason);

    const res = await request(app).get("/api/players");
    expect(res.body.map((d: { player: { mlbId: number } }) => d.player.mlbId)).toEqual([king.mlb_id]);
  });
});

describe("runContractWatch", () => {
  it("records a new signing once and shows it until terms are entered", async () => {
    const free = { ...king, contract: { ...king.contract!, opted_out_after: 2026 } };
    await upsertPlayer({ mlbId: king.mlb_id, name: king.name, position: king.position });
    await syncCuratedContracts([free], offseason);

    const fetchMock = vi.fn(async (_url: string) =>
      Response.json({
        transactions: [
          { id: 1, typeCode: "DFA", date: "2026-11-03", toTeam: { id: 135, name: "San Diego Padres" } },
          { id: 2, typeCode: "SFA", date: "2026-12-05", toTeam: { id: 147, name: "New York Yankees" } },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const december = new Date("2026-12-10T12:00:00Z");
    await runContractWatch([free], december);
    await runContractWatch([free], december);

    expect(String(fetchMock.mock.calls[0][0])).toContain("startDate=2026-10-01");
    expect(await prisma.contract.count({ where: { origin: "transaction" } })).toBe(1);
    const body = await dashboard(king.mlb_id);
    expect(body.contract).toMatchObject({ team: "New York Yankees", years: null, transactionId: 2 });
    expect(body.player.status).toBe("signed");
  });
});
