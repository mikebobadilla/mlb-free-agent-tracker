import { app } from "../src/app";

// Vercel function entry (D-036). The Express app from src/app.ts is the whole function:
// no listen, no timers. The SPA is served from dist/ by the CDN, not from here.
export default app;
