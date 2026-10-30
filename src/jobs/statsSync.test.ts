import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../store/playerStore", () => ({ upsertPlayer: vi.fn() }));

import { upsertPlayer } from "../store/playerStore";
import { startStatsSync } from "./statsSync";

const players = [{ name: "Test Player", position: "SS", mlb_id: 1 }];
const sixHours = 6 * 60 * 60 * 1000;

describe("startStatsSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(upsertPlayer).mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("syncs on start and again every 6 hours", async () => {
    const started = startStatsSync(players);
    await vi.advanceTimersByTimeAsync(1000);
    await started;
    expect(upsertPlayer).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(sixHours - 1000);
    expect(upsertPlayer).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(upsertPlayer).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(sixHours);
    expect(upsertPlayer).toHaveBeenCalledTimes(3);
  });

  it("keeps the schedule running after a scheduled sync fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(upsertPlayer)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(undefined as never);

    const started = startStatsSync(players);
    await vi.advanceTimersByTimeAsync(1000);
    await started;

    await vi.advanceTimersByTimeAsync(sixHours);
    expect(upsertPlayer).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith("Stats sync failed:", expect.any(Error));

    await vi.advanceTimersByTimeAsync(sixHours);
    expect(upsertPlayer).toHaveBeenCalledTimes(3);
  });
});
