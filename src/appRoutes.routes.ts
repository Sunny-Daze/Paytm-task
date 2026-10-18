import { Router } from "express";
import healthRouter from "./modules/health/health.routes.js";
import authRouter from "./modules/auth/auth.routes.js";

const appRouter = Router();

appRouter.use("/health", healthRouter);
appRouter.use("/auth", authRouter);

export default appRouter;
