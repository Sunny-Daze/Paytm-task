import { Router } from "express";
import healthRouter from "./modules/health/health.routes.js";

const appRouter = Router();

appRouter.use("/health", healthRouter);

export default appRouter;
