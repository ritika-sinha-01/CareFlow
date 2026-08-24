import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  if (mode === "production" && process.env.VITE_ALLOW_DEMO !== "true") {
    process.env.VITE_DEMO_MODE = "false";
  }

  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (mode === "production") {
    const apiUrl = (env.VITE_API_URL || process.env.VITE_API_URL || "").trim();
    if (!apiUrl) {
      throw new Error(
        "VITE_API_URL is missing. Set it to the production API origin (for example https://api.example.com) before building the frontend.",
      );
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://localhost:4000",
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
      include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    },
  };
});
