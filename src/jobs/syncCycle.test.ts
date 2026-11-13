import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./statsSync", () => ({ runStatsSync: vi.fn() }));
vi.mock("./curatedContracts", () => ({ syncCuratedContracts: vi.fn() }));
vi.mock("./contractWatcher", () => ({ runContractWatch: vi.fn() }));
vi.mock("../config/loadPlayers", () => ({ loadPlayers: vi.fn() }));

import { runContractWatch } from "./contractWatcher";
import { runStatsSync } from "./statsSync";
import { loadPlayers } from "../config/loadPlayers";
import { startBackgroundJobs } from "../server/index";
import { startNightlySync } from "./syncCycle";

const players = [{ name: "Test Player", position: "SS", mlb_id: 1 }];
const day = 24 * 60 * 60 * 1000;

describe("startNightlySync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(runStatsSync).mockReset();
    vi.mocked(runContractWatch).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("syncs on start and again once a day", async () => {
    await startNightlySync(players);
    expect(runStatsSync).toHaveBeenCalledTimes(1);
    expect(runContractWatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(day - 1);
    expect(runStatsSync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runStatsSync).toHaveBeenCalledTimes(2);
    expect(runContractWatch).toHaveBeenCalledTimes(2);
  });

  it("keeps the schedule running after a nightly sync fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runStatsSync)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Retrosheet down"))
      .mockResolvedValue(undefined);

    await startNightlySync(players);
    await vi.advanceTimersByTimeAsync(day);
    expect(consoleError).toHaveBeenCalledWith("Sync failed:", expect.any(Error));

    await vi.advanceTimersByTimeAsync(day);
    expect(runStatsSync).toHaveBeenCalledTimes(3);
  });

  it("resolves, logs and still schedules the timer when the first sync fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runStatsSync)
      .mockRejectedValueOnce(new Error("Retrosheet down"))
      .mockResolvedValue(undefined);

    await expect(startNightlySync(players)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("Initial sync failed:", expect.any(Error));
    expect(runContractWatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(day);
    expect(runStatsSync).toHaveBeenCalledTimes(2);
    expect(runContractWatch).toHaveBeenCalledTimes(1);
  });

  it("keeps running scheduled syncs after several consecutive failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runStatsSync)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("down 1"))
      .mockRejectedValueOnce(new Error("down 2"))
      .mockResolvedValue(undefined);

    await startNightlySync(players);
    await vi.advanceTimersByTimeAsync(day * 3);
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(runStatsSync).toHaveBeenCalledTimes(4);
    expect(runContractWatch).toHaveBeenCalledTimes(2);
  });
});

describe("startBackgroundJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(runStatsSync).mockReset();
    vi.mocked(runContractWatch).mockReset();
    vi.mocked(loadPlayers).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs a loadPlayers failure, schedules no sync and does not exit", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.mocked(loadPlayers).mockRejectedValue(new Error("bad yaml"));

    await expect(startBackgroundJobs()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("Failed to load players, sync not scheduled:", expect.any(Error));

    await vi.advanceTimersByTimeAsync(day);
    expect(runStatsSync).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("survives a failed first sync, does not exit and keeps the schedule", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.mocked(loadPlayers).mockResolvedValue(players);
    vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("no network")).mockResolvedValue(undefined);

    await expect(startBackgroundJobs()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("Initial sync failed:", expect.any(Error));
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(day);
    expect(runStatsSync).toHaveBeenCalledTimes(2);
  });
});
