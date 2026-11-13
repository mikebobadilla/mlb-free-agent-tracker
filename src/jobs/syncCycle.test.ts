import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("./statsSync", () => ({ runStatsSync: vi.fn() }));
vi.mock("./curatedContracts", () => ({ syncCuratedContracts: vi.fn() }));
vi.mock("./contractWatcher", () => ({ runContractWatch: vi.fn() }));
vi.mock("../config/loadPlayers", () => ({ loadPlayers: vi.fn() }));

import { runContractWatch } from "./contractWatcher";
import { runStatsSync } from "./statsSync";
import { loadPlayers } from "../config/loadPlayers";
import { startBackgroundJobs } from "../server/index";
import { retryDelayMs, startNightlySync } from "./syncCycle";
import { getSyncStatus, resetSyncStatus } from "./syncStatus";

const players = [{ name: "Test Player", position: "SS", mlb_id: 1 }];
const day = 24 * 60 * 60 * 1000;
const min = 60 * 1000;

function setup() {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(runStatsSync).mockReset();
    vi.mocked(runContractWatch).mockReset();
    vi.mocked(loadPlayers).mockReset();
    vi.mocked(loadPlayers).mockResolvedValue(players);
    resetSyncStatus();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
}

describe("retryDelayMs", () => {
  it("starts at 15 min, doubles, and caps at 1 h", () => {
    expect([1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([15 * min, 30 * min, 60 * min, 60 * min, 60 * min]);
  });
});

describe("startNightlySync", () => {
  setup();

  it("syncs on start and again once a day, re-reading the config each time", async () => {
    await startNightlySync();
    expect(runStatsSync).toHaveBeenCalledTimes(1);
    expect(runContractWatch).toHaveBeenCalledTimes(1);
    expect(loadPlayers).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(day - 1);
    expect(runStatsSync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runStatsSync).toHaveBeenCalledTimes(2);
    expect(runContractWatch).toHaveBeenCalledTimes(2);
    expect(loadPlayers).toHaveBeenCalledTimes(2);
  });

  it("resolves, logs and retries in 15 min when the first sync fails, then goes back to daily", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("Retrosheet down")).mockResolvedValue(undefined);

    await expect(startNightlySync()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("Initial sync failed:", expect.any(Error));
    expect(getSyncStatus()).toMatchObject({ scheduled: true, ok: false, lastError: "Retrosheet down" });

    await vi.advanceTimersByTimeAsync(15 * min - 1);
    expect(runStatsSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runStatsSync).toHaveBeenCalledTimes(2);
    expect(runContractWatch).toHaveBeenCalledTimes(1);
    expect(getSyncStatus()).toMatchObject({ ok: true, lastError: null });

    // Recovered: the next attempt is a day away, not 15 min.
    await vi.advanceTimersByTimeAsync(day - 1);
    expect(runStatsSync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(runStatsSync).toHaveBeenCalledTimes(3);
  });

  it("recovers without a restart once a broken players.yaml is fixed", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadPlayers).mockRejectedValueOnce(new Error("config/players.yaml: expected a non-empty list"));

    await startNightlySync();
    expect(runStatsSync).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("Initial sync failed:", expect.any(Error));
    expect(getSyncStatus()).toMatchObject({
      scheduled: true,
      ok: false,
      lastError: "config/players.yaml: expected a non-empty list",
    });
    expect(getSyncStatus().lastAttemptAt).not.toBeNull();

    await vi.advanceTimersByTimeAsync(15 * min);
    expect(runStatsSync).toHaveBeenCalledTimes(1);
    expect(getSyncStatus()).toMatchObject({ ok: true, lastError: null });
    expect(getSyncStatus().lastSuccessAt).not.toBeNull();
  });

  it("picks up a players.yaml fixed on disk, using the real loader", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { loadPlayers: realLoad } = await vi.importActual<typeof import("../config/loadPlayers")>("../config/loadPlayers");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "players-yaml-"));
    const file = path.join(dir, "players.yaml");
    fs.writeFileSync(file, "# nothing here\n");
    try {
      await startNightlySync({ load: () => realLoad(file) });
      expect(runStatsSync).not.toHaveBeenCalled();
      expect(getSyncStatus().lastError).toContain("non-empty list");

      fs.writeFileSync(file, "players:\n  - name: Test Player\n    position: SS\n    mlb_id: 1\n");
      await vi.advanceTimersByTimeAsync(15 * min);
      // The real loader does real file I/O, which fake timers don't drive.
      await vi.waitFor(() => expect(runStatsSync).toHaveBeenCalled());
      expect(runStatsSync).toHaveBeenCalledWith([expect.objectContaining({ mlb_id: 1 })], expect.any(Date));
      await vi.waitFor(() => expect(getSyncStatus()).toMatchObject({ ok: true, lastError: null }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("backs off 15 min, 30 min, 1 h, 1 h while failures continue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runStatsSync).mockRejectedValue(new Error("down"));

    await startNightlySync(); // attempt 1 at t=0
    const expectCalls = async (advanceMs: number, calls: number) => {
      await vi.advanceTimersByTimeAsync(advanceMs);
      expect(runStatsSync).toHaveBeenCalledTimes(calls);
    };
    await expectCalls(15 * min, 2);
    await expectCalls(29 * min, 2);
    await expectCalls(1 * min, 3);
    await expectCalls(59 * min, 3);
    await expectCalls(1 * min, 4);
    await expectCalls(60 * min, 5);
  });

  it("never runs two attempts at once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let release!: () => void;
    vi.mocked(runStatsSync).mockImplementationOnce(() => new Promise<void>((r) => (release = r)));

    const started = startNightlySync();
    await vi.advanceTimersByTimeAsync(3 * day); // first attempt still in flight
    expect(runStatsSync).toHaveBeenCalledTimes(1);

    release();
    await started;
    expect(runStatsSync).toHaveBeenCalledTimes(1);
  });

  it("keeps the daily schedule after several consecutive scheduled failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runStatsSync)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("down 1"))
      .mockRejectedValueOnce(new Error("down 2"))
      .mockResolvedValue(undefined);

    await startNightlySync();
    await vi.advanceTimersByTimeAsync(day); // daily attempt fails
    await vi.advanceTimersByTimeAsync(15 * min); // retry fails
    await vi.advanceTimersByTimeAsync(30 * min); // retry succeeds
    expect(runStatsSync).toHaveBeenCalledTimes(4);
    expect(getSyncStatus().ok).toBe(true);
  });
});

describe("startBackgroundJobs", () => {
  setup();

  it("does not exit and keeps retrying when players.yaml fails to load at boot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.mocked(loadPlayers).mockRejectedValueOnce(new Error("bad yaml"));

    await expect(startBackgroundJobs()).resolves.toBeUndefined();
    expect(getSyncStatus()).toMatchObject({ scheduled: true, ok: false, lastError: "bad yaml" });

    await vi.advanceTimersByTimeAsync(15 * min);
    expect(runStatsSync).toHaveBeenCalledTimes(1);
    expect(getSyncStatus().ok).toBe(true);
    expect(exit).not.toHaveBeenCalled();
  });

  it("survives a failed first sync, does not exit and retries", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("no network")).mockResolvedValue(undefined);

    await expect(startBackgroundJobs()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("Initial sync failed:", expect.any(Error));
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15 * min);
    expect(runStatsSync).toHaveBeenCalledTimes(2);
    expect(getSyncStatus().ok).toBe(true);
  });
});
