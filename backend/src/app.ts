import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env, isProductionEnv } from "./config/env.js";
import { isAllowedCorsOrigin, parseAllowedOrigins } from "./config/cors-origins.js";
import { apiRouter } from "./routes/index.js";
import { optionalAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (process.env.VERCEL) {
    app.set("trust proxy", 1);
  }

  const allowedOrigins = parseAllowedOrigins(env.CORS_ORIGIN, env.FRONTEND_URL);

  // CORS must run before Helmet so preflight can short-circuit with ACAO headers.
  // Helmet's default Cross-Origin-Resource-Policy is same-origin, which blocks a
  // separately hosted SPA from reading API responses even after a 200 OPTIONS.
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin, allowedOrigins, !isProductionEnv())) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      optionsSuccessStatus: 204,
    }),
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(optionalAuth);
  app.use("/api", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
