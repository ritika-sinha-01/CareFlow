import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      APP_ENV: "development",
      DATABASE_URL: "postgresql://careflow:careflow@127.0.0.1:54329/careflow?schema=public",
      JWT_SECRET: "test-secret-test-secret-test-secret-32",
      DEMO_MODE: "true",
      ENABLE_DEMO_SIMULATION: "true",
      EMAIL_PROVIDER: "test",
      CLINIC_TIMEZONE: "Asia/Kolkata",
    },
  },
});
