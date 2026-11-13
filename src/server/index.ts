import express from "express";
import path from "node:path";
import { apiRouter } from "../routes/api";
import { loadPlayers } from "../config/loadPlayers";
import { startNightlySync } from "../jobs/syncCycle";

const app = express();
app.use(express.json());
app.use("/api", apiRouter);

const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = Number(process.env.PORT ?? 8780);

export { app };

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

// Sync or config problems never take the web server down; it keeps serving stored data (D-031).
export async function startBackgroundJobs(): Promise<void> {
  let players;
  try {
    players = await loadPlayers();
  } catch (err) {
    console.error("Failed to load players, sync not scheduled:", err);
    return;
  }
  try {
    await startNightlySync(players);
  } catch (err) {
    console.error("Failed to start nightly sync:", err);
  }
}

if (process.env.NODE_ENV !== "test") {
  void startBackgroundJobs();
}
