import { Router } from "express";
import { getSyncStatus } from "../jobs/syncStatus";
import { getDashboardData } from "../store/playerStore";

export const apiRouter = Router();

apiRouter.get("/sync-status", async (_req, res) => {
  try {
    res.json(await getSyncStatus());
  } catch (err) {
    console.error("Could not read sync status:", err);
    res.status(500).json({ error: "Could not read the sync status" });
  }
});

apiRouter.get("/players", async (_req, res) => {
  try {
    const dashboards = await getDashboardData();
    res.json(dashboards);
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

apiRouter.get("/players/:mlbId", async (req, res) => {
  try {
    const mlbId = Number(req.params.mlbId);
    const dashboards = await getDashboardData([mlbId]);
    const found = dashboards[0];
    if (!found) {
      res.status(404).json({ error: `No player found for mlb_id ${mlbId}` });
      return;
    }
    res.json(found);
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
