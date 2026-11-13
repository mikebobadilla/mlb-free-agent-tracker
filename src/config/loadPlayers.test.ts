import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPlayers } from "./loadPlayers";

function writeConfig(yaml: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "players-")), "players.yaml");
  fs.writeFileSync(file, yaml);
  return file;
}

const player = (contract: string) => `players:
  - name: Test Player
    position: SS
    mlb_id: 1
    contract:
${contract}`;

describe("loadPlayers", () => {
  it("loads the checked-in players.yaml", async () => {
    const players = await loadPlayers();
    expect(players.length).toBeGreaterThan(0);
  });

  it.each([
    ["an empty file", ""],
    ["only comments", "# nobody tracked yet\n"],
    ["the wrong top-level key", "player:\n  - name: Test Player\n    position: SS\n    mlb_id: 1\n"],
    ["an empty players list", "players: []\n"],
    ["a null players key", "players:\n"],
    ["players that is not a list", "players: Test Player\n"],
  ])("refuses %s, naming the file and key", async (_label, yaml) => {
    const file = writeConfig(yaml);
    await expect(loadPlayers(file)).rejects.toThrow(file);
    await expect(loadPlayers(file)).rejects.toThrow("`players`");
  });

  it("keeps the signed date as text", async () => {
    const file = writeConfig(
      player(`      team: Padres
      years: 3
      total: 75000000
      first_season: 2026
      signed: 2025-12-19
      source: https://example.com/king`),
    );
    const [p] = await loadPlayers(file);
    expect(p.contract).toMatchObject({ signed: "2025-12-19", total: 75000000 });
  });

  it("rejects a contract without a source, naming the player", async () => {
    const file = writeConfig(
      player(`      team: Padres
      years: 3
      total: 75000000
      first_season: 2026
      signed: 2025-12-19`),
    );
    await expect(loadPlayers(file)).rejects.toThrow("Test Player: contract.source");
  });

  it("rejects an opt-out outside the contract", async () => {
    const file = writeConfig(
      player(`      team: Padres
      years: 3
      total: 75000000
      first_season: 2026
      signed: 2025-12-19
      opted_out_after: 2028
      source: https://example.com/king`),
    );
    await expect(loadPlayers(file)).rejects.toThrow("opted_out_after");
  });
});
