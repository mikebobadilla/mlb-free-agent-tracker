import { Router } from "express";
import { getDashboardData } from "../store/playerStore";

export const apiRouter = Router();

apiRouter.get("/players", async (_req, res) => {
  try {
    const dashboards = await getDashboardData();
    res.json(dashboards);
  } catch (err) {
    res.status(500).json({ error: String(err) });
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
    res.status(500).json({ error: String(err) });
  }
});
