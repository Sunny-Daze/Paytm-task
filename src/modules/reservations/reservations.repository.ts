import type { PoolClient } from "pg";
import type {
  IdempotencyRecord,
  LockedReservation,
  LockedSeat,
  ReservationResponse,
} from "./reservations.types.js";

type IdempotencyKeyRef = {
  userId: string;
  operation: "reserve" | "confirm" | "cancel";
  key: string;
};

export const claimIdempotencyKey = async (
  tx: PoolClient,
  ref: IdempotencyKeyRef,
  requestHash: string,
): Promise<boolean> => {
  const { rowCount } = await tx.query(
    `
      INSERT INTO idempotency_requests (user_id, operation, idempotency_key, request_hash)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `,
    [ref.userId, ref.operation, ref.key, requestHash],
  );

  return rowCount === 1;
};

export const getIdempotencyRecord = async (
  tx: PoolClient,
  ref: IdempotencyKeyRef,
): Promise<IdempotencyRecord | undefined> => {
  const { rows } = await tx.query<IdempotencyRecord>(
    `
      SELECT request_hash, response_status, response_body
      FROM idempotency_requests
      WHERE user_id = $1 AND operation = $2 AND idempotency_key = $3
    `,
    [ref.userId, ref.operation, ref.key],
  );

  return rows[0];
};

export const completeIdempotencyKey = async (
  tx: PoolClient,
  ref: IdempotencyKeyRef,
  result: {
    reservationId: string;
    statusCode: number;
    body: ReservationResponse;
  },
): Promise<void> => {
  await tx.query(
    `
      UPDATE idempotency_requests
      SET reservation_id = $4, response_status = $5, response_body = $6, completed_at = now()
      WHERE user_id = $1 AND operation = $2 AND idempotency_key = $3
    `,
    [
      ref.userId,
      ref.operation,
      ref.key,
      result.reservationId,
      result.statusCode,
      JSON.stringify(result.body),
    ],
  );
};

export const lockUserShow = async (
  tx: PoolClient,
  userId: string,
  showId: string,
): Promise<void> => {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `reserve:${showId}:${userId}`,
  ]);
};

export const countActiveSeatsForUser = async (
  tx: PoolClient,
  userId: string,
  showId: string,
): Promise<number> => {
  const { rows } = await tx.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM reservation_items ri
      JOIN reservations r ON r.id = ri.reservation_id
      WHERE r.show_id = $1
        AND r.user_id = $2
        AND (
          r.status = 'confirmed'
          OR (r.status = 'held' AND r.hold_expires_at > clock_timestamp())
        )
    `,
    [showId, userId],
  );

  return rows[0]!.count;
};

export const lockSeatsByLabel = async (
  tx: PoolClient,
  showId: string,
  labels: string[],
): Promise<LockedSeat[]> => {
  const { rows: seats } = await tx.query<{
    id: string;
    seat_label: string;
    status: LockedSeat["status"];
    current_reservation_id: string | null;
  }>(
    `
      SELECT id, seat_label, status, current_reservation_id
      FROM seats
      WHERE show_id = $1 AND seat_label = ANY($2::text[])
      ORDER BY id
      FOR UPDATE
    `,
    [showId, labels],
  );

  const holderIds = seats.flatMap((seat) =>
    seat.status === "held" && seat.current_reservation_id
      ? [seat.current_reservation_id]
      : [],
  );
  const lapsed = new Set<string>();

  if (holderIds.length > 0) {
    const { rows } = await tx.query<{ id: string }>(
      `
        SELECT id
        FROM reservations
        WHERE id = ANY($1::uuid[])
          AND status = 'held'
          AND hold_expires_at <= clock_timestamp()
      `,
      [holderIds],
    );
    rows.forEach((row) => lapsed.add(row.id));
  }

  return seats.map((seat) => ({
    id: seat.id,
    seat_label: seat.seat_label,
    status: seat.status,
    claimable:
      seat.status === "available" ||
      (seat.status === "held" &&
        seat.current_reservation_id !== null &&
        lapsed.has(seat.current_reservation_id)),
  }));
};

export const insertHeldReservation = async (
  tx: PoolClient,
  input: {
    showId: string;
    userId: string;
    amountPaise: number;
    holdSeconds: number;
  },
): Promise<{ id: string; hold_expires_at: Date }> => {
  const { rows } = await tx.query<{ id: string; hold_expires_at: Date }>(
    `
      INSERT INTO reservations (show_id, user_id, amount, status, hold_expires_at)
      VALUES ($1, $2, $3, 'held', clock_timestamp() + make_interval(secs => $4))
      RETURNING id, hold_expires_at
    `,
    [input.showId, input.userId, input.amountPaise, input.holdSeconds],
  );

  return rows[0]!;
};

export const holdSeats = async (
  tx: PoolClient,
  reservationId: string,
  seatIds: string[],
): Promise<void> => {
  await tx.query(
    `
      UPDATE seats
      SET status = 'held', current_reservation_id = $1
      WHERE id = ANY($2::uuid[])
    `,
    [reservationId, seatIds],
  );
};

export const insertReservationItems = async (
  tx: PoolClient,
  input: {
    reservationId: string;
    showId: string;
    seatIds: string[];
    unitPricePaise: number;
  },
): Promise<void> => {
  await tx.query(
    `
      INSERT INTO reservation_items
        (reservation_id, seat_id, show_id, seat_label_at_reservation, unit_price_paise)
      SELECT $1, s.id, s.show_id, s.seat_label, $4
      FROM seats s
      WHERE s.id = ANY($2::uuid[]) AND s.show_id = $3
    `,
    [input.reservationId, input.seatIds, input.showId, input.unitPricePaise],
  );
};

export const lockHeldSeatsOfReservation = async (
  tx: PoolClient,
  reservationId: string,
): Promise<{ id: string; seat_label: string }[]> => {
  const { rows } = await tx.query<{ id: string; seat_label: string }>(
    `
      SELECT id, seat_label
      FROM seats
      WHERE current_reservation_id = $1 AND status = 'held'
      ORDER BY id
      FOR UPDATE
    `,
    [reservationId],
  );

  return rows;
};

export const lockReservation = async (
  tx: PoolClient,
  reservationId: string,
): Promise<LockedReservation | undefined> => {
  const { rows } = await tx.query<LockedReservation>(
    `
      SELECT
        id,
        show_id,
        user_id,
        amount::int AS amount_paise,
        status,
        hold_expires_at,
        COALESCE(hold_expires_at <= clock_timestamp(), false) AS hold_expired
      FROM reservations
      WHERE id = $1
      FOR UPDATE
    `,
    [reservationId],
  );

  return rows[0];
};

export const getReservationSeatLabels = async (
  tx: PoolClient,
  reservationId: string,
): Promise<string[]> => {
  const { rows } = await tx.query<{ seat_label: string }>(
    `
      SELECT seat_label_at_reservation AS seat_label
      FROM reservation_items
      WHERE reservation_id = $1
      ORDER BY seat_label_at_reservation
    `,
    [reservationId],
  );

  return rows.map((row) => row.seat_label);
};

export const markReservationConfirmed = async (
  tx: PoolClient,
  reservationId: string,
  seatIds: string[],
): Promise<void> => {
  await tx.query(
    `UPDATE reservations SET status = 'confirmed', confirmed_at = now() WHERE id = $1`,
    [reservationId],
  );
  await tx.query(
    `
      UPDATE seats
      SET status = 'confirmed'
      WHERE id = ANY($2::uuid[]) AND current_reservation_id = $1 AND status = 'held'
    `,
    [reservationId, seatIds],
  );
};

export const markReservationExpired = async (
  tx: PoolClient,
  reservationId: string,
  seatIds: string[],
): Promise<void> => {
  await tx.query(
    `UPDATE reservations SET status = 'expired', expired_at = now() WHERE id = $1`,
    [reservationId],
  );
  await tx.query(
    `
      UPDATE seats
      SET status = 'available', current_reservation_id = NULL
      WHERE id = ANY($2::uuid[]) AND current_reservation_id = $1 AND status = 'held'
    `,
    [reservationId, seatIds],
  );
};
