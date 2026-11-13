import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./statsSync", () => ({ runStatsSync: vi.fn() }));
vi.mock("./curatedContracts", () => ({ syncCuratedContracts: vi.fn() }));
vi.mock("./contractWatcher", () => ({ runContractWatch: vi.fn() }));
vi.mock("../config/loadPlayers", () => ({ loadPlayers: vi.fn() }));

import { loadPlayers } from "../config/loadPlayers";
import { startBackgroundJobs } from "../server/index";
import { runStatsSync } from "./statsSync";
import { startNightlySync } from "./syncCycle";
import { getSyncStatus, resetSyncStatus } from "./syncStatus";

const players = [{ name: "Test Player", position: "SS", mlb_id: 1 }];
const day = 24 * 60 * 60 * 1000;
const load = async () => players;

describe("sync status", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T08:00:00Z"));
    resetSyncStatus();
    vi.mocked(runStatsSync).mockReset();
    vi.mocked(loadPlayers).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts unscheduled with nothing recorded", () => {
    expect(getSyncStatus()).toEqual({
      scheduled: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      ok: false,
    });
  });

  it("loadPlayers failure: still scheduled (it retries), error recorded, not ok (D-038)", async () => {
    vi.mocked(loadPlayers).mockRejectedValue(new Error("bad yaml"));
    await startBackgroundJobs();

    expect(getSyncStatus()).toMatchObject({
      scheduled: true,
      lastAttemptAt: "2026-11-13T08:00:00.000Z",
      lastSuccessAt: null,
      lastError: "bad yaml",
      ok: false,
    });
  });

  it("first sync failure: still scheduled, error recorded, not ok", async () => {
    vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("no network"));
    await startNightlySync({ load });

    expect(getSyncStatus()).toMatchObject({
      scheduled: true,
      lastAttemptAt: "2026-11-13T08:00:00.000Z",
      lastSuccessAt: null,
      lastError: "no network",
      ok: false,
    });
  });

  it("scheduled failure after a success keeps the last success time", async () => {
    vi.mocked(runStatsSync).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Retrosheet down"));
    await startNightlySync({ load });
    await vi.advanceTimersByTimeAsync(day);

    expect(getSyncStatus()).toEqual({
      scheduled: true,
      lastAttemptAt: "2026-11-14T08:00:00.000Z",
      lastSuccessAt: "2026-11-13T08:00:00.000Z",
      lastError: "Retrosheet down",
      ok: false,
    });
  });

  it("success clears an earlier error and is ok", async () => {
    vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("no network")).mockResolvedValue(undefined);
    await startNightlySync({ load });
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000); // the retry

    expect(getSyncStatus()).toEqual({
      scheduled: true,
      lastAttemptAt: "2026-11-13T08:15:00.000Z",
      lastSuccessAt: "2026-11-13T08:15:00.000Z",
      lastError: null,
      ok: true,
    });
  });

  it("is already scheduled while the first sync is still running", async () => {
    let finish: () => void = () => {};
    vi.mocked(runStatsSync).mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const started = startNightlySync({ load });

    expect(getSyncStatus()).toMatchObject({ scheduled: true, lastSuccessAt: null, ok: true });
    finish();
    await started;
    expect(getSyncStatus().lastSuccessAt).not.toBeNull();
  });
});
