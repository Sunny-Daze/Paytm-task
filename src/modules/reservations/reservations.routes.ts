import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import {
  confirmReservation,
  expireReservation,
} from "./reservations.controller.js";

const reservationsRouter = Router();
reservationsRouter.use(requireAuth);

reservationsRouter.post("/:id/confirm", confirmReservation);
reservationsRouter.post("/:id/expire", expireReservation);

export default reservationsRouter;
