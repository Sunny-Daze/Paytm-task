import db, { withTransaction } from "../../db/postgres.db.js";
import type {
  CreateShowInput,
  Show,
  ShowMeta,
  ShowState,
} from "./shows.types.js";

export const insertShowWithSeats = async (
  show: CreateShowInput,
): Promise<Show> =>
  withTransaction(async (tx) => {
    const { rows } = await tx.query<Show>(
      `
        INSERT INTO shows (name, price, total_seats, per_user_limit)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, price, total_seats, per_user_limit, created_at
      `,
      [show.name, show.price_paise, show.seats.length, show.per_user_limit],
    );
    const created = rows[0]!;

    await tx.query(
      `
        INSERT INTO seats (show_id, seat_label, status)
        SELECT $1, unnest($2::text[]), 'available'
      `,
      [created.id, show.seats],
    );

    return created;
  });

export const getShowStateById = async (
  id: string,
): Promise<ShowState | undefined> => {
  const { rows } = await db.query<ShowState>(
    `
      WITH seat_state AS (
        SELECT
          st.show_id,
          st.seat_label,
          CASE
            WHEN st.status = 'held' AND r.hold_expires_at <= now() THEN 'available'
            ELSE st.status
          END AS status
        FROM seats st
        LEFT JOIN reservations r ON r.id = st.current_reservation_id
        WHERE st.show_id = $1
      )
      SELECT
        s.id,
        s.name,
        s.price::int AS price_paise,
        s.total_seats,
        s.per_user_limit,
        s.created_at,
        json_build_object(
          'available', count(ss.seat_label) FILTER (WHERE ss.status = 'available'),
          'held',      count(ss.seat_label) FILTER (WHERE ss.status = 'held'),
          'confirmed', count(ss.seat_label) FILTER (WHERE ss.status = 'confirmed')
        ) AS counts,
        COALESCE(
          json_agg(
            json_build_object('seat_label', ss.seat_label, 'status', ss.status)
            ORDER BY ss.seat_label
          ) FILTER (WHERE ss.seat_label IS NOT NULL),
          '[]'
        ) AS seats
      FROM shows s
      LEFT JOIN seat_state ss ON ss.show_id = s.id
      WHERE s.id = $1
      GROUP BY s.id
    `,
    [id],
  );

  return rows[0];
};

export const getShowMetaById = async (
  id: string,
): Promise<ShowMeta | undefined> => {
  const { rows } = await db.query<ShowMeta>(
    `SELECT price::int AS price_paise, per_user_limit FROM shows WHERE id = $1`,
    [id],
  );

  return rows[0];
};
