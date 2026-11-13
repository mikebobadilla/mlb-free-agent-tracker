import express from "express";
import { apiRouter } from "./routes/api";
import { cronRouter } from "./routes/cron";

// The Express app and its /api routes, and nothing else (D-036). Importing this file must not
// listen, serve files, start a timer or read config: the Vercel function imports it as-is, and
// src/server/index.ts adds static files, the SPA fallback, the listener and the sync timer.
export const app = express();
app.use(express.json());
app.use("/api/cron", cronRouter);
app.use("/api", apiRouter);
