import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { loginController, meController, registerController, updateProfileController } from "../controllers/portal.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

export const authRouter = Router();

const authAttemptLimit = rateLimit({ windowMs: 15 * 60_000, max: 20, prefix: "auth" });

authRouter.post("/register", authAttemptLimit, asyncHandler(registerController));
authRouter.post("/login", authAttemptLimit, asyncHandler(loginController));
authRouter.get("/me", requireAuth, asyncHandler(meController));
authRouter.patch("/profile", requireAuth, asyncHandler(updateProfileController));
