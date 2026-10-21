import { Router } from "express";
import healthRouter from "./modules/health/health.routes.js";
import authRouter from "./modules/auth/auth.routes.js";
import showsRouter from "./modules/shows/shows.routes.js";
import reservationsRouter from "./modules/reservations/reservations.routes.js";

const appRouter = Router();

appRouter.use("/health", healthRouter);
appRouter.use("/auth", authRouter);
appRouter.use("/shows", showsRouter);
appRouter.use("/reservations", reservationsRouter);

export default appRouter;
