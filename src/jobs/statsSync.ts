import { strFromU8, unzipSync } from "fflate";
import type { PlayerConfig } from "../config/loadPlayers";
import { upcomingSeason } from "../contracts";
import { parseCsv } from "../csv";
import { getKnownPlayerIds, upsertPlayer } from "../store/playerStore";
import { lookupPlayerIds, type PlayerIds } from "./playerIds";

// Retrosheet: free to use with its notice shown on the site (D-027).
const retrosheetBase = "https://www.retrosheet.org/downloads";
const fipConstant = 3.1;

export interface SeasonStats {
  obp: number | null;
  slg: number | null;
  ops: number | null;
  era: number | null;
  whip: number | null;
  ip: number | null; // baseball notation: 42.2 = 42⅔ innings (D-013)
  k9: number | null;
  fip: number | null;
}

interface Totals {
  pa: number; ab: number; h: number; d: number; t: number; hr: number; sf: number; hbp: number; w: number;
  outs: number; er: number; pH: number; pW: number; pHbp: number; pHr: number; k: number;
}

const zeroTotals = (): Totals => ({
  pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, sf: 0, hbp: 0, w: 0,
  outs: 0, er: 0, pH: 0, pW: 0, pHbp: 0, pHr: 0, k: 0,
});

/** Regular-season totals per Retrosheet id, summed from per-game rows (all teams). */
export function seasonStats(battingCsv: string, pitchingCsv: string, retroIds: Set<string>): Map<string, SeasonStats> {
  const totals = new Map<string, Totals>();
  const totalsFor = (id: string) => {
    let t = totals.get(id);
    if (!t) totals.set(id, (t = zeroTotals()));
    return t;
  };

  const bat = parseCsv(battingCsv);
  const [bId, bType, bStat] = ["id", "gametype", "stattype"].map(bat.col);
  const bCols = ["b_pa", "b_ab", "b_h", "b_d", "b_t", "b_hr", "b_sf", "b_hbp", "b_w"].map(bat.col);
  for (const r of bat.rows) {
    if (!retroIds.has(r[bId]) || r[bType] !== "regular" || r[bStat] !== "value") continue;
    const t = totalsFor(r[bId]);
    const [pa, ab, h, d, tr, hr, sf, hbp, w] = bCols.map((c) => Number(r[c]) || 0);
    Object.assign(t, {
      pa: t.pa + pa, ab: t.ab + ab, h: t.h + h, d: t.d + d, t: t.t + tr,
      hr: t.hr + hr, sf: t.sf + sf, hbp: t.hbp + hbp, w: t.w + w,
    });
  }

  const pit = parseCsv(pitchingCsv);
  const [pId, pType, pStat] = ["id", "gametype", "stattype"].map(pit.col);
  const pCols = ["p_ipouts", "p_er", "p_h", "p_w", "p_hbp", "p_hr", "p_k"].map(pit.col);
  for (const r of pit.rows) {
    if (!retroIds.has(r[pId]) || r[pType] !== "regular" || r[pStat] !== "value") continue;
    const t = totalsFor(r[pId]);
    const [outs, er, h, w, hbp, hr, k] = pCols.map((c) => Number(r[c]) || 0);
    Object.assign(t, {
      outs: t.outs + outs, er: t.er + er, pH: t.pH + h, pW: t.pW + w,
      pHbp: t.pHbp + hbp, pHr: t.pHr + hr, k: t.k + k,
    });
  }

  const result = new Map<string, SeasonStats>();
  for (const [id, t] of totals) {
    const obpDen = t.ab + t.w + t.hbp + t.sf;
    const obp = t.pa > 0 && obpDen > 0 ? (t.h + t.w + t.hbp) / obpDen : null;
    const slg = t.pa > 0 && t.ab > 0 ? (t.h + t.d + 2 * t.t + 3 * t.hr) / t.ab : null;
    const innings = t.outs / 3;
    const pitched = t.outs > 0;
    result.set(id, {
      obp,
      slg,
      ops: obp != null && slg != null ? obp + slg : null,
      era: pitched ? (9 * t.er) / innings : null,
      whip: pitched ? (t.pW + t.pH) / innings : null,
      ip: pitched ? Math.floor(t.outs / 3) + (t.outs % 3) / 10 : null,
      k9: pitched ? (9 * t.k) / innings : null,
      fip: pitched ? (13 * t.pHr + 3 * (t.pW + t.pHbp) - 2 * t.k) / innings + fipConstant : null,
    });
  }
  return result;
}

/** The season's batting and pitching CSVs, or null if Retrosheet hasn't published it yet. */
async function fetchRetrosheetSeason(season: number): Promise<{ batting: string; pitching: string } | null> {
  const res = await fetch(`${retrosheetBase}/${season}/${season}csvs.zip`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Retrosheet returned ${res.status} for ${season}`);
  const names = [`${season}batting.csv`, `${season}pitching.csv`];
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()), { filter: (f) => names.includes(f.name) });
  const [batting, pitching] = names.map((n) => files[n]);
  if (!batting || !pitching) throw new Error(`Retrosheet ${season} zip is missing ${names.join(" or ")}`);
  return { batting: strFromU8(batting), pitching: strFromU8(pitching) };
}

function ageOn(birth: Date, today: Date): number {
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  return today.getUTCFullYear() - birth.getUTCFullYear() - (beforeBirthday ? 1 : 0);
}

/**
 * Stats for the latest season Retrosheet has published (the last completed season,
 * or the one before while Retrosheet catches up). Ids and birth dates come from the
 * Chadwick register and are cached on the player row.
 */
export async function runStatsSync(players: PlayerConfig[], today: Date = new Date()): Promise<void> {
  const mlbIds = players.map((p) => p.mlb_id);
  const ids: Map<number, PlayerIds> = await getKnownPlayerIds(mlbIds);
  const missing = mlbIds.filter((id) => !ids.has(id));
  if (missing.length > 0) {
    for (const [id, found] of await lookupPlayerIds(missing)) ids.set(id, found);
  }

  const latest = upcomingSeason(today) - 1;
  let season = latest;
  let data = await fetchRetrosheetSeason(season);
  if (!data) data = await fetchRetrosheetSeason(--season);
  if (!data) throw new Error(`Retrosheet has neither ${latest} nor ${season} season data`);

  const retroIds = new Set([...ids.values()].map((i) => i.retroId).filter((r): r is string => r != null));
  const stats = seasonStats(data.batting, data.pitching, retroIds);

  for (const p of players) {
    const pid: PlayerIds = ids.get(p.mlb_id) ?? { retroId: null, birthDate: null };
    if (!pid.retroId) console.warn(`No Retrosheet id for ${p.name} (${p.mlb_id}) in the Chadwick register yet`);
    const s = pid.retroId ? stats.get(pid.retroId) : undefined;
    await upsertPlayer({
      mlbId: p.mlb_id,
      name: p.name,
      position: p.position,
      prevTeam: p.prev_team ?? null,
      retroId: pid.retroId,
      birthDate: pid.birthDate,
      age: pid.birthDate ? ageOn(pid.birthDate, today) : null,
      season: s ? season : null,
      ...s,
    });
  }
}
