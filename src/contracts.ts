// Rules for picking a player's current contract and deriving status/expiry (D-025).
// The offseason starts Oct 1: from then on, signings and status refer to next season.

export interface ContractFacts {
  origin: string;
  years: number | null;
  firstSeason: number | null;
  optedOutAfter: number | null;
  signedDate: Date | null;
}

export type ContractStatus = "signed" | "unsigned";

/** Season a contract signed (or a status checked) on this date applies to. */
export function upcomingSeason(date: Date): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 9 ? year + 1 : year;
}

export function contractSeason(c: ContractFacts): number | null {
  if (c.firstSeason != null) return c.firstSeason;
  return c.signedDate ? upcomingSeason(c.signedDate) : null;
}

/** Last season the contract covers, ending early if the player opted out. */
export function contractExpiry(c: ContractFacts | null): number | null {
  if (!c) return null;
  if (c.optedOutAfter != null) return c.optedOutAfter;
  if (c.firstSeason == null || c.years == null) return null;
  return c.firstSeason + c.years - 1;
}

/**
 * Newest signing wins (by season it starts). For the same season a curated
 * contract beats a bare transaction, so entering terms replaces "terms not entered".
 */
export function pickCurrentContract<T extends ContractFacts>(contracts: T[]): T | null {
  let best: T | null = null;
  for (const c of contracts) {
    if (!best || compare(c, best) > 0) best = c;
  }
  return best;
}

function compare(a: ContractFacts, b: ContractFacts): number {
  const bySeason = (contractSeason(a) ?? -Infinity) - (contractSeason(b) ?? -Infinity);
  if (bySeason !== 0) return bySeason;
  const byOrigin = Number(a.origin === "curated") - Number(b.origin === "curated");
  if (byOrigin !== 0) return byOrigin;
  return (a.signedDate?.getTime() ?? 0) - (b.signedDate?.getTime() ?? 0);
}

/** Signed if the current contract covers the upcoming season; otherwise a free agent. */
export function statusFor(current: ContractFacts | null, today: Date): ContractStatus {
  if (!current) return "unsigned";
  const season = upcomingSeason(today);
  const expiry = contractExpiry(current);
  if (expiry != null) return expiry >= season ? "signed" : "unsigned";
  // A transaction without terms: a signing for the upcoming season means signed.
  const start = contractSeason(current);
  return start != null && start >= season ? "signed" : "unsigned";
}
