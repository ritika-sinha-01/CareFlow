import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { loginController, meController, registerController, updateProfileController } from "../controllers/portal.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(registerController));
authRouter.post("/login", asyncHandler(loginController));
authRouter.get("/me", requireAuth, asyncHandler(meController));
authRouter.patch("/profile", requireAuth, asyncHandler(updateProfileController));
