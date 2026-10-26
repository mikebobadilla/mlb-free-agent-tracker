import { upsertPlayer } from "../store/playerStore";
import type { PlayerConfig } from "../config/loadPlayers";

const mlbAPIBase = "https://statsapi.mlb.com/api/v1";
const requestDelayMs = 200;
const fipConstant = 3.1;

interface FlexFloat {
  value: number;
  valid: boolean;
}

function parseFlex(v: unknown): FlexFloat {
  if (typeof v === "number" && !Number.isNaN(v)) return { value: v, valid: true };
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "" || s === "-" || s === ".---" || s === "-.--" || s === "*.**") {
      return { value: 0, valid: false };
    }
    const n = Number(s);
    if (!Number.isNaN(n)) return { value: n, valid: true };
  }
  return { value: 0, valid: false };
}

function flexPtr(f: FlexFloat): number | null {
  return f.valid ? f.value : null;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB API returned ${res.status}`);
  return (await res.json()) as T;
}

interface SeasonStats {
  season: number;
  war: number;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  era: number | null;
  whip: number | null;
  ip: number | null;
  k9: number | null;
  fip: number | null;
}

interface StatsSplit {
  team?: { name?: string } | null;
  stat?: Record<string, unknown>;
}

interface StatsResponse {
  stats?: Array<{
    type?: { displayName?: string };
    group?: { displayName?: string };
    splits?: StatsSplit[];
  }>;
}

async function fetchSeasonStats(mlbId: number, season: number): Promise<SeasonStats | null> {
  const url = `${mlbAPIBase}/people/${mlbId}/stats?stats=season&group=hitting,pitching&season=${season}`;
  const resp = await getJSON<StatsResponse>(url);
  let result: SeasonStats | null = null;

  for (const statGroup of resp.stats ?? []) {
    if (statGroup.type?.displayName !== "season") continue;
    let idx = -1;
    const splits = statGroup.splits ?? [];
    for (let i = 0; i < splits.length; i++) {
      if (splits[i].team == null) { idx = i; break; }
    }
    if (idx === -1 && splits.length > 0) idx = 0;
    if (idx === -1) continue;
    const stat = (statGroup.splits![idx].stat ?? {}) as Record<string, unknown>;

    if (!result) {
      result = { season, war: 0, obp: null, slg: null, ops: null, era: null, whip: null, ip: null, k9: null, fip: null };
    }
    const group = statGroup.group?.displayName;
    if (group === "hitting") {
      const war = parseFlex(stat.war);
      result.war = war.value;
      result.obp = flexPtr(parseFlex(stat.obp));
      result.slg = flexPtr(parseFlex(stat.slg));
      result.ops = flexPtr(parseFlex(stat.ops));
    } else if (group === "pitching") {
      result.era = flexPtr(parseFlex(stat.era));
      result.whip = flexPtr(parseFlex(stat.whip));
      result.ip = flexPtr(parseFlex(stat.ip));
      result.k9 = flexPtr(parseFlex(stat.strikeoutsPer9Inn));
      const outs = typeof stat.outs === "number" ? stat.outs : 0;
      const hr = typeof stat.homeRuns === "number" ? stat.homeRuns : 0;
      const bb = typeof stat.baseOnBalls === "number" ? stat.baseOnBalls : 0;
      const hbp = typeof stat.hitByPitch === "number" ? stat.hitByPitch : 0;
      const k = typeof stat.strikeOuts === "number" ? stat.strikeOuts : 0;
      result.fip = outs > 0 ? (13 * hr + 3 * (bb + hbp) - 2 * k) / (outs / 3) + fipConstant : null;
    }
  }
  return result;
}

export async function runStatsSync(players: PlayerConfig[]): Promise<void> {
  const season = new Date().getFullYear();
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (i > 0) await new Promise((r) => setTimeout(r, requestDelayMs));

    const ageRes = await fetch(`${mlbAPIBase}/people/${p.mlb_id}`);
    const ageData = (await ageRes.json()) as { people?: Array<{ currentAge?: number }> };
    const age = ageData.people?.[0]?.currentAge ?? 0;

    await new Promise((r) => setTimeout(r, requestDelayMs));
    const stats = await fetchSeasonStats(p.mlb_id, season);

    await upsertPlayer({
      mlbId: p.mlb_id,
      name: p.name,
      position: p.position,
      age,
      prevTeam: p.prev_team ?? null,
      war: stats?.war ?? null,
      season: stats?.season ?? null,
      obp: stats?.obp ?? null,
      slg: stats?.slg ?? null,
      ops: stats?.ops ?? null,
      era: stats?.era ?? null,
      whip: stats?.whip ?? null,
      ip: stats?.ip ?? null,
      k9: stats?.k9 ?? null,
      fip: stats?.fip ?? null,
    });
  }
}
