import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8780",
        changeOrigin: true,
      },
    },
  },
  test: {
    // Feature worktrees live under .claude/worktrees/ and .worktrees/; their tests belong to their own branches.
    exclude: [...configDefaults.exclude, ".claude/**", ".worktrees/**"],
    setupFiles: ["src/test/setupDb.ts"],
  },
});
