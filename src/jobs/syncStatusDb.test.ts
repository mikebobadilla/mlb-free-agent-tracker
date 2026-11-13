import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./statsSync", () => ({ runStatsSync: vi.fn() }));
vi.mock("./curatedContracts", () => ({ syncCuratedContracts: vi.fn() }));
vi.mock("./contractWatcher", () => ({ runContractWatch: vi.fn() }));
// The real store (so these tests hit the test Postgres schema), except a test can make a write fail once.
vi.mock("../store/syncStatusStore", async (importOriginal) => {
  const real = await importOriginal<typeof import("../store/syncStatusStore")>();
  return { ...real, saveSyncStatusFields: vi.fn(real.saveSyncStatusFields) };
});

import { prisma } from "../db/prisma";
import { saveSyncStatusFields } from "../store/syncStatusStore";
import { runStatsSync } from "./statsSync";
import { runSyncCycle } from "./syncCycle";
import {
  getSyncStatus,
  markSyncAttempt,
  markSyncFailure,
  markSyncScheduled,
  markSyncSuccess,
  maxErrorLength,
  resetSyncStatus,
  staleAfterMs,
} from "./syncStatus";

// These tests use real Postgres I/O and no fake timers; time comes in through the `now` arguments.
const t0 = new Date("2026-11-13T08:00:00Z");
const hour = 60 * 60 * 1000;
const players = [{ name: "Test Player", position: "SS", mlb_id: 1 }];

describe("sync status in the database (D-037)", () => {
  beforeEach(async () => {
    vi.stubEnv("VERCEL", "");
    vi.mocked(runStatsSync).mockReset();
    await resetSyncStatus();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is empty and not ok before anything is recorded", async () => {
    expect(await getSyncStatus(t0)).toEqual({
      scheduled: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      ok: false,
    });
  });

  it("success: records the time, clears an earlier error and is ok when scheduled", async () => {
    markSyncScheduled(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await markSyncFailure(new Error("no network"), new Date(t0.getTime() - hour));
    await markSyncAttempt(t0);
    await markSyncSuccess(t0);

    expect(await getSyncStatus(t0)).toEqual({
      scheduled: true,
      lastAttemptAt: "2026-11-13T08:00:00.000Z",
      lastSuccessAt: "2026-11-13T08:00:00.000Z",
      lastError: null,
      ok: true,
    });
  });

  it("failure: stores the error and the attempt time, keeps the last success, is not ok", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    markSyncScheduled(true);
    await markSyncSuccess(t0);
    await markSyncFailure(new Error("Retrosheet down"), new Date(t0.getTime() + hour));

    expect(await getSyncStatus(new Date(t0.getTime() + hour))).toEqual({
      scheduled: true,
      lastAttemptAt: "2026-11-13T09:00:00.000Z",
      lastSuccessAt: "2026-11-13T08:00:00.000Z",
      lastError: "Retrosheet down",
      ok: false,
    });
  });

  it("failure: stores at most 300 characters but logs the whole error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("x".repeat(1000));
    await markSyncFailure(error, t0);

    const stored = (await getSyncStatus(t0)).lastError;
    expect(maxErrorLength).toBe(300);
    expect(stored).toBe("x".repeat(300));
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);

    await markSyncFailure("y".repeat(301), t0); // a thrown string is capped too
    expect((await getSyncStatus(t0)).lastError).toHaveLength(300);
  });

  it("staleness: ok until the last success is 48 hours old, then not ok with no error", async () => {
    markSyncScheduled(true);
    await markSyncSuccess(t0);
    expect(staleAfterMs).toBe(48 * hour);

    const justUnder = await getSyncStatus(new Date(t0.getTime() + 48 * hour - 1));
    expect(justUnder.ok).toBe(true);

    const atLimit = await getSyncStatus(new Date(t0.getTime() + 48 * hour));
    expect(atLimit).toMatchObject({ ok: false, lastError: null, lastSuccessAt: "2026-11-13T08:00:00.000Z" });
  });

  it("staleness: never succeeded means not ok, even when scheduled with no error", async () => {
    markSyncScheduled(true);
    await markSyncAttempt(t0);
    expect(await getSyncStatus(t0)).toMatchObject({ scheduled: true, lastSuccessAt: null, lastError: null, ok: false });
  });

  it("scheduled: true on Vercel without an in-process timer, false otherwise", async () => {
    await markSyncSuccess(t0);
    expect(await getSyncStatus(t0)).toMatchObject({ scheduled: false, ok: false });

    vi.stubEnv("VERCEL", "1");
    expect(await getSyncStatus(t0)).toMatchObject({ scheduled: true, ok: true });
  });

  it("scheduled: true once this process has started the timer", async () => {
    await markSyncSuccess(t0);
    markSyncScheduled(true);
    expect(await getSyncStatus(t0)).toMatchObject({ scheduled: true, ok: true });
  });

  it("a failing status write is logged and swallowed, never thrown", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failOnce = () => vi.mocked(saveSyncStatusFields).mockRejectedValueOnce(new Error("db down"));

    failOnce();
    await expect(markSyncAttempt(t0)).resolves.toBeUndefined();
    failOnce();
    await expect(markSyncSuccess(t0)).resolves.toBeUndefined();
    failOnce();
    await expect(markSyncFailure(new Error("boom"), t0)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith("Could not record sync status:", expect.any(Error));
    expect(await getSyncStatus(t0)).toMatchObject({ lastAttemptAt: null, lastSuccessAt: null, lastError: null });
  });

  it("a sync cycle finishes (and its own error still surfaces) while status writes fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // First cycle writes twice (attempt, success); second cycle writes twice (attempt, failure).
    for (let i = 0; i < 4; i++) vi.mocked(saveSyncStatusFields).mockRejectedValueOnce(new Error("db down"));

    await expect(runSyncCycle(players)).resolves.toBeUndefined();
    expect(runStatsSync).toHaveBeenCalledTimes(1);

    vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("Retrosheet down"));
    await expect(runSyncCycle(players)).rejects.toThrow("Retrosheet down");
    expect(await getSyncStatus()).toMatchObject({ lastAttemptAt: null, lastSuccessAt: null, lastError: null });
  });

  it("runSyncCycle records an attempt then a success in the database", async () => {
    markSyncScheduled(true);
    await runSyncCycle(players);
    const status = await getSyncStatus();
    expect(status).toMatchObject({ scheduled: true, lastError: null, ok: true });
    expect(status.lastAttemptAt).not.toBeNull();
    expect(status.lastSuccessAt).not.toBeNull();
  });

  it("runSyncCycle records the failure and still rethrows it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("Retrosheet down"));
    await expect(runSyncCycle(players)).rejects.toThrow("Retrosheet down");
    expect(await getSyncStatus()).toMatchObject({ lastError: "Retrosheet down", lastSuccessAt: null });
  });

  it("survives a restart: a fresh module graph and a fresh Prisma client read what was recorded", async () => {
    markSyncScheduled(true);
    await markSyncSuccess(new Date(Date.now() - hour));

    // A restart (or another serverless instance) has no module state and its own database connection.
    const holder = globalThis as unknown as { prisma?: unknown };
    const original = holder.prisma;
    holder.prisma = undefined;
    vi.resetModules();
    try {
      const fresh = await import("./syncStatus");
      const freshPrisma = (await import("../db/prisma")).prisma;
      expect(freshPrisma).not.toBe(prisma);
      try {
        const status = await fresh.getSyncStatus();
        expect(status.lastSuccessAt).not.toBeNull();
        expect(status.lastError).toBeNull();
        // The timer flag is per process: not carried over, so scheduled is false here (VERCEL unset).
        expect(status).toMatchObject({ scheduled: false, ok: false });
        vi.stubEnv("VERCEL", "1");
        expect((await fresh.getSyncStatus()).ok).toBe(true);
      } finally {
        await freshPrisma.$disconnect();
      }
    } finally {
      holder.prisma = original;
    }
  });
});
