import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { demoRouter } from "./demo.routes.js";
import { authRouter } from "./auth.routes.js";
import { doctorsRouter } from "./doctors.routes.js";
import { patientRouter } from "./patient.routes.js";
import { doctorRouter } from "./doctor.routes.js";
import { adminRouter } from "./admin.routes.js";
import { integrationsRouter } from "./integrations.routes.js";
import { internalRouter } from "./internal.routes.js";
import { isDemoSimulationEnabled } from "../config/env.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/doctors", doctorsRouter);
apiRouter.use("/internal", internalRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/patient", patientRouter);
apiRouter.use("/doctor", doctorRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/integrations", integrationsRouter);

if (isDemoSimulationEnabled()) {
  apiRouter.use("/demo", demoRouter);
}
