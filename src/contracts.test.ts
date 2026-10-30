import { describe, expect, it } from "vitest";
import { contractExpiry, pickCurrentContract, statusFor, upcomingSeason, type ContractFacts } from "./contracts";

const curated = (firstSeason: number, years: number, optedOutAfter: number | null = null): ContractFacts => ({
  origin: "curated",
  years,
  firstSeason,
  optedOutAfter,
  signedDate: new Date(`${firstSeason - 1}-12-15`),
});
const transaction = (date: string): ContractFacts => ({
  origin: "transaction",
  years: null,
  firstSeason: null,
  optedOutAfter: null,
  signedDate: new Date(date),
});

describe("upcomingSeason", () => {
  it("rolls over to next season on Oct 1", () => {
    expect(upcomingSeason(new Date("2026-09-30"))).toBe(2026);
    expect(upcomingSeason(new Date("2026-10-01"))).toBe(2027);
    expect(upcomingSeason(new Date("2027-02-15"))).toBe(2027);
  });
});

describe("contractExpiry", () => {
  it("is the last season covered, or the opt-out season", () => {
    expect(contractExpiry(curated(2025, 15))).toBe(2039);
    expect(contractExpiry(curated(2026, 3, 2026))).toBe(2026);
    expect(contractExpiry(transaction("2026-12-01"))).toBeNull();
  });
});

describe("pickCurrentContract", () => {
  it("prefers a newer signing even without terms", () => {
    const old = curated(2026, 1);
    const fresh = transaction("2026-12-01");
    expect(pickCurrentContract([old, fresh])).toBe(fresh);
  });

  it("prefers curated terms over a transaction for the same signing", () => {
    const signing = transaction("2025-12-19");
    const terms = curated(2026, 3);
    expect(pickCurrentContract([terms, signing])).toBe(terms);
    expect(pickCurrentContract([signing, terms])).toBe(terms);
  });

  it("ignores transactions from long-past signings", () => {
    const terms = curated(2025, 15);
    expect(pickCurrentContract([transaction("2016-07-07"), terms])).toBe(terms);
  });
});

describe("statusFor", () => {
  const offseason = new Date("2026-10-29");

  it("is signed while the contract covers the upcoming season", () => {
    expect(statusFor(curated(2025, 15), offseason)).toBe("signed");
  });

  it("is a free agent once the contract has run out or the player opted out", () => {
    expect(statusFor(curated(2026, 1), offseason)).toBe("unsigned");
    expect(statusFor(curated(2026, 3, 2026), offseason)).toBe("unsigned");
    expect(statusFor(null, offseason)).toBe("unsigned");
  });

  it("is signed after a signing this offseason, before terms are entered", () => {
    expect(statusFor(transaction("2026-11-20"), offseason)).toBe("signed");
    expect(statusFor(transaction("2026-02-16"), offseason)).toBe("unsigned");
  });
});
