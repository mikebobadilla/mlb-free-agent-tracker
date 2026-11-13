import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { loadPlayers } from "../config/loadPlayers";
import { runSyncCycle } from "../jobs/syncCycle";
import { getSyncStatus, markSyncFailure } from "../jobs/syncStatus";

export const cronRouter = Router();

/** An attempt that started less than this long ago means a sync is running or just ran (D-036). */
export const overlapWindowMs = 10 * 60 * 1000;

// Compare SHA-256 digests so the buffers always have equal length and the check does not leak
// the secret's length or how much of a guess matched.
function authorized(header: string | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || header === undefined) return false; // no secret configured: closed, never open
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

// Vercel cron calls this with `Authorization: Bearer $CRON_SECRET`. The function is frozen once
// it responds, so the sync is awaited before the response goes out.
cronRouter.get("/sync", async (req, res) => {
  if (!authorized(req.header("authorization"))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const started = Date.now();
  try {
    const { lastAttemptAt } = await getSyncStatus();
    if (lastAttemptAt !== null) {
      const age = started - new Date(lastAttemptAt).getTime();
      if (age >= 0 && age < overlapWindowMs) {
        res.json({ ok: true, skipped: true }); // Vercel can deliver a cron twice
        return;
      }
    }
    let players;
    try {
      players = await loadPlayers();
    } catch (err) {
      await markSyncFailure(err); // runSyncCycle records its own failures, but this runs before it
      throw err;
    }
    await runSyncCycle(players);
    res.json({ ok: true, durationMs: Date.now() - started });
  } catch (err) {
    console.error("Cron sync failed:", err);
    res.status(500).json({ ok: false });
  }
});
