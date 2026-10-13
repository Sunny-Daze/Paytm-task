import { Router } from "express";
import { checkLiveness, checkReadiness } from "./health.controller.js";

const healthRouter = Router();

healthRouter.get("/live", checkLiveness);
healthRouter.get("/ready", checkReadiness);

export default healthRouter;
