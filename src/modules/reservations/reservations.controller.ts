import type { Request, Response } from "express";
import { httpError } from "../../shared/http/httpError.js";
import { success } from "../../shared/http/httpSuccess.js";
import {
  confirmReservation as confirmReservationService,
  expireReservation as expireReservationService,
  reserveSeats as reserveSeatsService,
} from "./reservations.service.js";
import {
  reservationIdParamsSchema,
  reserveBodySchema,
  reserveParamsSchema,
  resolveIdempotencyKey,
} from "./reservations.validations.js";

export const reserveSeats = async (req: Request, res: Response) => {
  if (!req.user) {
    return httpError(401, "Unauthorized");
  }

  const { id: showId } = reserveParamsSchema.parse(req.params);
  const body = reserveBodySchema.parse(req.body);
  const idempotencyKey = resolveIdempotencyKey(
    req.get("Idempotency-Key"),
    body.idempotency_key,
  );

  const result = await reserveSeatsService({
    showId,
    userId: req.user.id,
    seats: body.seats,
    idempotencyKey,
  });

  if (result.replayed) {
    res.set("Idempotent-Replayed", "true");
  }

  res.status(result.statusCode).json(success(result.body));
};

export const confirmReservation = async (req: Request, res: Response) => {
  if (!req.user) {
    return httpError(401, "Unauthorized");
  }

  const { id } = reservationIdParamsSchema.parse(req.params);
  const result = await confirmReservationService(id, req.user.id);

  if (result.replayed) {
    res.set("Idempotent-Replayed", "true");
  }
  3;

  res.json(success(result.body));
};

export const expireReservation = async (req: Request, res: Response) => {
  const { id } = reservationIdParamsSchema.parse(req.params);
  const result = await expireReservationService(id);

  if (result.replayed) {
    res.set("Idempotent-Replayed", "true");
  }

  res.json(success(result.body));
};
