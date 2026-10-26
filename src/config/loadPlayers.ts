import fs from "node:fs";
import yaml from "js-yaml";

export interface PlayerConfig {
  name: string;
  position: string;
  mlb_id: number;
  prev_team?: string;
}

export async function loadPlayers(configPath = "config/players.yaml"): Promise<PlayerConfig[]> {
  const raw = await fs.promises.readFile(configPath, "utf8");
  const parsed = yaml.load(raw) as { players?: PlayerConfig[] } | null;
  return parsed?.players ?? [];
}
