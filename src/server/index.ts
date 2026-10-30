import express from "express";
import path from "node:path";
import { apiRouter } from "../routes/api";
import { loadPlayers } from "../config/loadPlayers";
import { startStatsSync } from "../jobs/statsSync";
import { startContractWatcher } from "../jobs/contractWatcher";
import { syncCuratedContracts } from "../jobs/curatedContracts";

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

async function main() {
  const players = await loadPlayers();
  await startStatsSync(players);
  await syncCuratedContracts(players);
  startContractWatcher(players);
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });
}
