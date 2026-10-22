import { createHash } from "node:crypto";
import pg, { type PoolClient } from "pg";
import appConfig from "../../config/app.config.js";
import { withTransaction } from "../../db/postgres.db.js";
import { KeyedGate } from "../../shared/concurrency/keyedGate.js";
import { httpError } from "../../shared/http/httpError.js";
import { getShowMeta } from "../shows/shows.service.js";
import type { ShowMeta } from "../shows/shows.types.js";
import {
  cacheConfirmedSeats,
  cacheReserveResult,
  evictSeatClaims,
  findSeatsClaimedByOthers,
  getCachedReserveResult,
} from "./reservations.cache.js";
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  countActiveSeatsForUser,
  getIdempotencyRecord,
  getReservationSeatLabels,
  holdSeats,
  insertHeldReservation,
  insertReservationItems,
  lockHeldSeatsOfReservation,
  lockReservation,
  lockSeatsByLabel,
  lockUserShow,
  markReservationConfirmed,
  markReservationExpired,
} from "./reservations.repository.js";
import type {
  ConfirmReservationResult,
  ExpireReservationResult,
  ReservationResponse,
  ReserveSeatsInput,
  ReserveSeatsResult,
} from "./reservations.types.js";

const hashReserveRequest = (showId: string, seats: string[]): string =>
  createHash("sha256")
    .update(JSON.stringify({ show_id: showId, seats: [...seats].sort() }))
    .digest("hex");

const seatGate = new KeyedGate();

export const reserveSeats = async (
  input: ReserveSeatsInput,
): Promise<ReserveSeatsResult> => {
  const requestHash = hashReserveRequest(input.showId, input.seats);
  const seatKeys = input.seats.map((label) => `${input.showId}:${label}`);
  const showMeta = getShowMeta(input.showId);
  let show: ShowMeta | undefined;
  let cacheAvailable = true;

  for (;;) {
    const [cachedResult, meta, claimedByOthers] = await Promise.all([
      getCachedReserveResult(input.userId, input.idempotencyKey),
      showMeta,
      findSeatsClaimedByOthers(input.showId, input.seats, input.userId),
    ]);
    show = meta;

    if (cachedResult) {
      if (cachedResult.request_hash !== requestHash) {
        return httpError(
          409,
          "Idempotency key was already used with a different request",
          {
            code: "IDEMPOTENCY_KEY_REUSED",
          },
        );
      }

      return {
        statusCode: cachedResult.status_code,
        body: cachedResult.body,
        replayed: true,
      };
    }

    if (!show) {
      return httpError(404, "Show not found", { code: "SHOW_NOT_FOUND" });
    }

    if (claimedByOthers === null) {
      cacheAvailable = false;
      break;
    }

    if (claimedByOthers.length > 0) {
      return httpError(409, "Seats already taken", {
        code: "SEAT_TAKEN",
        details: { seats: claimedByOthers },
      });
    }

    const busy = seatGate.busy(seatKeys);

    if (!busy) {
      break;
    }

    await busy;
  }

  const knownShow = show;
  const reserve = async () => {
    const result = await reserveSeatsInDb(input, knownShow, requestHash);

    await cacheReserveResult(input.userId, input.idempotencyKey, {
      request_hash: requestHash,
      status_code: result.statusCode,
      body: result.body,
    });

    return result;
  };

  return cacheAvailable ? seatGate.run(seatKeys, reserve) : reserve();
};

const reserveSeatsInDb = (
  input: ReserveSeatsInput,
  show: ShowMeta,
  requestHash: string,
): Promise<ReserveSeatsResult> => {
  const idempotencyRef = {
    userId: input.userId,
    operation: "reserve" as const,
    key: input.idempotencyKey,
  };

  return withTransaction(async (tx) => {
    const claimed = await claimIdempotencyKeyForUser(
      tx,
      idempotencyRef,
      requestHash,
    );

    if (!claimed) {
      return replayIdempotentRequest(tx, idempotencyRef, requestHash);
    }

    await lockUserShow(tx, input.userId, input.showId);

    const alreadyHeld = await countActiveSeatsForUser(
      tx,
      input.userId,
      input.showId,
    );

    if (alreadyHeld + input.seats.length > show.per_user_limit) {
      return httpError(409, "Per-user seat limit exceeded", {
        code: "PER_USER_LIMIT",
        details: {
          limit: show.per_user_limit,
          already_held: alreadyHeld,
          requested: input.seats.length,
        },
      });
    }

    const lockedSeats = await lockSeatsByLabel(tx, input.showId, input.seats);

    if (lockedSeats.length !== input.seats.length) {
      const found = new Set(lockedSeats.map((seat) => seat.seat_label));
      return httpError(404, "Some seats do not exist for this show", {
        code: "SEAT_NOT_FOUND",
        details: { seats: input.seats.filter((label) => !found.has(label)) },
      });
    }

    const taken = lockedSeats.filter((seat) => !seat.claimable);

    if (taken.length > 0) {
      return httpError(409, "Seats already taken", {
        code: "SEAT_TAKEN",
        details: { seats: taken.map((seat) => seat.seat_label) },
      });
    }

    const seatIds = lockedSeats.map((seat) => seat.id);
    const amountPaise = show.price_paise * input.seats.length;

    const reservation = await insertHeldReservation(tx, {
      showId: input.showId,
      userId: input.userId,
      amountPaise,
      holdSeconds: appConfig.HOLD_TTL_SECONDS,
    });
    const reservationId = reservation.id;

    await holdSeats(tx, reservationId, seatIds);
    await insertReservationItems(tx, {
      reservationId,
      showId: input.showId,
      seatIds,
      unitPricePaise: show.price_paise,
    });

    const body: ReservationResponse = {
      reservation_id: reservationId,
      show_id: input.showId,
      user_id: input.userId,
      seats: [...input.seats].sort(),
      amount_paise: amountPaise,
      status: "held",
      hold_expires_at: reservation.hold_expires_at.toISOString(),
    };

    await completeIdempotencyKey(tx, idempotencyRef, {
      reservationId,
      statusCode: 201,
      body,
    });

    return { statusCode: 201, body, replayed: false };
  });
};

const claimIdempotencyKeyForUser = async (
  tx: PoolClient,
  ref: Parameters<typeof claimIdempotencyKey>[1],
  requestHash: string,
): Promise<boolean> => {
  try {
    return await claimIdempotencyKey(tx, ref, requestHash);
  } catch (err) {
    if (
      err instanceof pg.DatabaseError &&
      err.code === "23503" &&
      err.constraint === "idempotency_requests_user_id_fkey"
    ) {
      return httpError(401, "User no longer exists, log in again", {
        code: "USER_NOT_FOUND",
        cause: err,
      });
    }

    throw err;
  }
};

const replayIdempotentRequest = async (
  tx: PoolClient,
  ref: Parameters<typeof getIdempotencyRecord>[1],
  requestHash: string,
): Promise<ReserveSeatsResult> => {
  const record = await getIdempotencyRecord(tx, ref);

  if (record && record.request_hash !== requestHash) {
    return httpError(
      409,
      "Idempotency key was already used with a different request",
      {
        code: "IDEMPOTENCY_KEY_REUSED",
      },
    );
  }

  if (
    !record ||
    record.response_status === null ||
    record.response_body === null
  ) {
    return httpError(
      409,
      "A request with this idempotency key is still in progress",
      {
        code: "IDEMPOTENCY_IN_PROGRESS",
      },
    );
  }

  return {
    statusCode: record.response_status,
    body: record.response_body,
    replayed: true,
  };
};

export const confirmReservation = async (
  reservationId: string,
  userId: string,
): Promise<ConfirmReservationResult> => {
  const result = await confirmReservationInDb(reservationId, userId);

  await cacheConfirmedSeats(
    result.body.show_id,
    result.body.seats,
    result.body.user_id,
  );

  return result;
};

const confirmReservationInDb = (
  reservationId: string,
  userId: string,
): Promise<ConfirmReservationResult> =>
  withTransaction(async (tx) => {
    const heldSeats = await lockHeldSeatsOfReservation(tx, reservationId);
    const reservation = await lockReservation(tx, reservationId);

    if (!reservation || reservation.user_id !== userId) {
      return httpError(404, "Reservation not found", {
        code: "RESERVATION_NOT_FOUND",
      });
    }

    const seats = await getReservationSeatLabels(tx, reservationId);
    const body = (
      status: ReservationResponse["status"],
    ): ReservationResponse => ({
      reservation_id: reservation.id,
      show_id: reservation.show_id,
      user_id: reservation.user_id,
      seats,
      amount_paise: reservation.amount_paise,
      status,
      hold_expires_at: reservation.hold_expires_at?.toISOString() ?? null,
    });

    if (reservation.status === "confirmed") {
      return { body: body("confirmed"), replayed: true };
    }

    if (reservation.status !== "held") {
      return httpError(409, `Reservation is ${reservation.status}`, {
        code: "RESERVATION_NOT_HELD",
        details: { status: reservation.status },
      });
    }

    if (reservation.hold_expired || heldSeats.length !== seats.length) {
      return httpError(409, "Hold has expired", {
        code: "HOLD_EXPIRED",
        details: { hold_expires_at: reservation.hold_expires_at },
      });
    }

    await markReservationConfirmed(
      tx,
      reservationId,
      heldSeats.map((seat) => seat.id),
    );

    return { body: body("confirmed"), replayed: false };
  });

export const expireReservation = async (
  reservationId: string,
): Promise<ExpireReservationResult> => {
  const result = await expireReservationInDb(reservationId);

  await evictSeatClaims(result.body.show_id, result.body.released_seats);

  return result;
};

const expireReservationInDb = (
  reservationId: string,
): Promise<ExpireReservationResult> =>
  withTransaction(async (tx) => {
    const heldSeats = await lockHeldSeatsOfReservation(tx, reservationId);
    const reservation = await lockReservation(tx, reservationId);

    if (!reservation) {
      return httpError(404, "Reservation not found", {
        code: "RESERVATION_NOT_FOUND",
      });
    }

    if (reservation.status === "expired") {
      return {
        body: {
          reservation_id: reservation.id,
          show_id: reservation.show_id,
          status: "expired",
          released_seats: [],
        },
        replayed: true,
      };
    }

    if (reservation.status !== "held") {
      return httpError(409, `Reservation is ${reservation.status}`, {
        code: "RESERVATION_NOT_HELD",
        details: { status: reservation.status },
      });
    }

    if (!reservation.hold_expired) {
      return httpError(409, "Hold is still active", {
        code: "HOLD_ACTIVE",
        details: { hold_expires_at: reservation.hold_expires_at },
      });
    }

    await markReservationExpired(
      tx,
      reservationId,
      heldSeats.map((seat) => seat.id),
    );

    return {
      body: {
        reservation_id: reservation.id,
        show_id: reservation.show_id,
        status: "expired",
        released_seats: heldSeats.map((seat) => seat.seat_label).sort(),
      },
      replayed: false,
    };
  });
