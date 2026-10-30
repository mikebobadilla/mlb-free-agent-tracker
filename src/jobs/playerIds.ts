import { parseCsv } from "../csv";

// Chadwick Baseball Bureau Register, ODC Attribution License (D-027).
const registerBase = "https://raw.githubusercontent.com/chadwickbureau/register/master/data";
const registerShards = "0123456789abcdef";

export interface PlayerIds {
  retroId: string | null;
  birthDate: Date | null;
}

/** Retrosheet ids and birth dates for the given MLB ids, from one register shard's CSV. */
export function parseRegister(text: string, mlbIds: Set<number>): Map<number, PlayerIds> {
  const { col, rows } = parseCsv(text);
  const [mlbam, retro, year, month, day] = ["key_mlbam", "key_retro", "birth_year", "birth_month", "birth_day"].map(col);
  const found = new Map<number, PlayerIds>();
  for (const r of rows) {
    const mlbId = Number(r[mlbam]);
    if (!r[mlbam] || !mlbIds.has(mlbId)) continue;
    const [y, m, d] = [r[year], r[month], r[day]].map(Number);
    found.set(mlbId, {
      retroId: r[retro] || null,
      birthDate: y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null,
    });
  }
  return found;
}

/** Look players up in the register, reading shards until every id is found (~4 MB each). */
export async function lookupPlayerIds(mlbIds: number[]): Promise<Map<number, PlayerIds>> {
  const wanted = new Set(mlbIds);
  const found = new Map<number, PlayerIds>();
  for (const shard of registerShards) {
    if (found.size === wanted.size) break;
    const res = await fetch(`${registerBase}/people-${shard}.csv`);
    if (!res.ok) throw new Error(`Chadwick register returned ${res.status} for shard ${shard}`);
    for (const [id, ids] of parseRegister(await res.text(), wanted)) found.set(id, ids);
  }
  return found;
}
