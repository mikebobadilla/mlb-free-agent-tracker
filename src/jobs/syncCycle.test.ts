import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./statsSync", () => ({ runStatsSync: vi.fn() }));
vi.mock("./curatedContracts", () => ({ syncCuratedContracts: vi.fn() }));
vi.mock("./contractWatcher", () => ({ runContractWatch: vi.fn() }));

import { runContractWatch } from "./contractWatcher";
import { runStatsSync } from "./statsSync";
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
});
