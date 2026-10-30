import fs from "node:fs";
import yaml from "js-yaml";

/** A player's current contract, entered by hand from public reporting (D-024). */
export interface ContractConfig {
  team: string;
  years: number;
  total: number; // guaranteed value, USD
  first_season: number;
  signed: string; // YYYY-MM-DD
  source: string; // URL of the report the numbers came from
  opted_out_after?: number; // season after which the player opted out
  notes?: string;
}

export interface PlayerConfig {
  name: string;
  position: string;
  mlb_id: number;
  prev_team?: string;
  contract?: ContractConfig;
}

export async function loadPlayers(configPath = "config/players.yaml"): Promise<PlayerConfig[]> {
  const raw = await fs.promises.readFile(configPath, "utf8");
  // CORE_SCHEMA keeps dates like 2024-12-11 as strings instead of Date objects.
  const parsed = yaml.load(raw, { schema: yaml.CORE_SCHEMA }) as { players?: PlayerConfig[] } | null;
  const players = parsed?.players ?? [];
  for (const p of players) {
    if (p.contract !== undefined) validateContract(p.name, p.contract);
  }
  return players;
}

function validateContract(player: string, c: ContractConfig): void {
  const fail = (msg: string) => {
    throw new Error(`players.yaml: ${player}: contract.${msg}`);
  };
  if (typeof c !== "object" || c === null) fail("must be a mapping");
  if (typeof c.team !== "string" || c.team.trim() === "") fail("team is required");
  if (!Number.isInteger(c.years) || c.years < 1) fail("years must be a whole number ≥ 1");
  if (typeof c.total !== "number" || !(c.total > 0)) fail("total must be a positive number of dollars");
  if (!Number.isInteger(c.first_season) || c.first_season < 1900) fail("first_season must be a year");
  if (typeof c.signed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.signed) || Number.isNaN(Date.parse(c.signed))) {
    fail("signed must be a date like 2024-12-11");
  }
  if (typeof c.source !== "string" || !/^https?:\/\//.test(c.source)) fail("source must be the URL of the report");
  if (c.opted_out_after !== undefined) {
    const last = c.first_season + c.years - 1;
    if (!Number.isInteger(c.opted_out_after) || c.opted_out_after < c.first_season || c.opted_out_after >= last) {
      fail(`opted_out_after must be a season from ${c.first_season} to ${last - 1}`);
    }
  }
  if (c.notes !== undefined && typeof c.notes !== "string") fail("notes must be text");
}
