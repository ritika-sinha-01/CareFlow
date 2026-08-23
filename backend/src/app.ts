import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env, isProductionEnv } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { optionalAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        const allowed = env.CORS_ORIGIN.split(",").map((value) => value.trim());
        if (allowed.includes(origin)) {
          callback(null, true);
          return;
        }
        if (!isProductionEnv() && /^http:\/\/localhost:\d+$/.test(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(optionalAuth);
  app.use("/api", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
