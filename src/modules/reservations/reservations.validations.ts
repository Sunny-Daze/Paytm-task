import z from "zod";
import { httpError } from "../../shared/http/httpError.js";

const idempotencyKeySchema = z.string().trim().min(1).max(255);

export const reserveParamsSchema = z.object({
  id: z.uuid(),
});

export const reservationIdParamsSchema = z.object({
  id: z.uuid(),
});

export const reserveBodySchema = z.object({
  seats: z
    .array(z.string().trim().min(1).max(10))
    .min(1)
    .max(20)
    .refine((seats) => new Set(seats).size === seats.length, {
      message: "Seat labels must be unique",
    }),
  idempotency_key: idempotencyKeySchema.optional(),
});

export const resolveIdempotencyKey = (
  header: string | undefined,
  bodyKey: string | undefined,
): string => {
  const headerKey =
    header === undefined ? undefined : idempotencyKeySchema.parse(header);

  if (headerKey && bodyKey && headerKey !== bodyKey) {
    return httpError(400, "Idempotency-Key header and body differ", {
      code: "IDEMPOTENCY_KEY_MISMATCH",
    });
  }

  const key = headerKey ?? bodyKey;

  if (!key) {
    return httpError(400, "Idempotency key is required", {
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
  }

  return key;
};
