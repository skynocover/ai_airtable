import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ai-airtable/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    // 開發時把 API/Auth 轉發到本地 Worker(wrangler dev,預設 8787)。
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
