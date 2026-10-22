import redis from "../../db/redis.db.js";
import { bestEffort } from "../../shared/cache/bestEffort.js";
import { jitteredTtlSeconds } from "../../shared/cache/jitter.js";
import type { ReservationResponse } from "./reservations.types.js";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const CONFIRMED_SEAT_TTL_SECONDS = 24 * 60 * 60;
const HOLD_SAFETY_MARGIN_MS = 1000;

const idempotencyKey = (userId: string, key: string) =>
  `idem:reserve:${userId}:${key}`;
const seatKey = (showId: string, label: string) => `seat:${showId}:${label}`;

export type CachedReserveResult = {
  request_hash: string;
  status_code: number;
  body: ReservationResponse;
};

type SeatClaim = { status: "held" | "confirmed"; user_id: string };

export const getCachedReserveResult = (
  userId: string,
  key: string,
): Promise<CachedReserveResult | null> =>
  bestEffort(
    "get idempotent result",
    async () => {
      const raw = await redis.get(idempotencyKey(userId, key));
      return raw ? (JSON.parse(raw) as CachedReserveResult) : null;
    },
    null,
  );

export const findSeatsClaimedByOthers = (
  showId: string,
  labels: string[],
  userId: string,
): Promise<string[] | null> =>
  bestEffort(
    "check seat claims",
    async () => {
      const values = await redis.mget(
        labels.map((label) => seatKey(showId, label)),
      );

      return labels.filter((_, i) => {
        const raw = values[i];
        return raw ? (JSON.parse(raw) as SeatClaim).user_id !== userId : false;
      });
    },

    null,
  );

export const cacheReserveResult = (
  userId: string,
  key: string,
  result: CachedReserveResult,
): Promise<void> =>
  bestEffort(
    "cache reserve result",
    async () => {
      const { body } = result;
      const pipeline = redis
        .pipeline()
        .set(
          idempotencyKey(userId, key),
          JSON.stringify(result),
          "EX",
          jitteredTtlSeconds(IDEMPOTENCY_TTL_SECONDS),
        );

      const holdExpiresAt = body.hold_expires_at
        ? new Date(body.hold_expires_at).getTime() - HOLD_SAFETY_MARGIN_MS
        : null;

      if (
        body.status === "held" &&
        holdExpiresAt &&
        holdExpiresAt > Date.now()
      ) {
        const claim = JSON.stringify({
          status: "held",
          user_id: body.user_id,
        } satisfies SeatClaim);
        body.seats.forEach((label) =>
          pipeline.set(
            seatKey(body.show_id, label),
            claim,
            "PXAT",
            holdExpiresAt,
          ),
        );
      }

      await pipeline.exec();
    },
    undefined,
  );

export const cacheConfirmedSeats = (
  showId: string,
  labels: string[],
  userId: string,
): Promise<void> =>
  bestEffort(
    "cache confirmed seats",
    async () => {
      const claim = JSON.stringify({
        status: "confirmed",
        user_id: userId,
      } satisfies SeatClaim);
      const pipeline = redis.pipeline();
      labels.forEach((label) =>
        pipeline.set(
          seatKey(showId, label),
          claim,
          "EX",
          jitteredTtlSeconds(CONFIRMED_SEAT_TTL_SECONDS),
        ),
      );
      await pipeline.exec();
    },
    undefined,
  );

export const evictSeatClaims = (
  showId: string,
  labels: string[],
): Promise<void> =>
  bestEffort(
    "evict seat claims",
    async () => {
      if (labels.length > 0) {
        await redis.del(...labels.map((label) => seatKey(showId, label)));
      }
    },
    undefined,
  );
