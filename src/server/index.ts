import express from "express";
import path from "node:path";
import { app } from "../app";
import { startNightlySync } from "../jobs/syncCycle";

// Local and Node-host entry: the shared app (src/app.ts) plus static files, the SPA fallback,
// the listener and the in-process sync timer. On Vercel, api/index.ts uses src/app.ts directly.
// Static files and the fallback come after the /api routes, so they never shadow them.
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

// Sync or config problems never take the web server down; it keeps serving stored data (D-031),
// and the scheduler retries on its own, re-reading players.yaml each time (D-038).
export async function startBackgroundJobs(): Promise<void> {
  await startNightlySync();
}

if (process.env.NODE_ENV !== "test") {
  void startBackgroundJobs();
}
