import type { Contract } from "./models";

/** $765M, $1.35M, $500K */
export function fmtMoney(dollars: number): string {
  if (dollars >= 1_000_000) return `$${Number((dollars / 1_000_000).toFixed(2))}M`;
  return `$${Math.round(dollars / 1000)}K`;
}

/** "15 yr / $765M", or a note that only the signing is known. */
export function fmtTerms(c: Contract): string {
  if (c.years == null || c.totalValue == null) return "terms not entered";
  return `${c.years} yr / ${fmtMoney(c.totalValue)}`;
}

export function fmtStatus(status: string): string {
  return status === "unsigned" ? "free agent" : status;
}
