import { Router } from "express";
import { createShow, getShow } from "./shows.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { reserveSeats } from "../reservations/reservations.controller.js";

const showsRouter = Router();
showsRouter.use(requireAuth);

showsRouter.post("/", createShow);
showsRouter.get("/:id", getShow);
showsRouter.post("/:id/reserve", reserveSeats);

export default showsRouter;
