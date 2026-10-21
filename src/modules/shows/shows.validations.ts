import z from "zod";

export const showSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    seats: z
      .array(z.string().trim().min(1).max(10))
      .min(1)
      .refine((seats) => new Set(seats).size === seats.length, {
        message: "Seat labels must be unique",
      }),
    price_paise: z.number().int().nonnegative(),
    per_user_limit: z.number().int().positive().default(3),
  })
  .refine((show) => show.per_user_limit <= show.seats.length, {
    message: "per_user_limit exceeds the total number of seats",
    path: ["per_user_limit"],
  });

export const showIdParamsSchema = z.object({
  id: z.uuid(),
});
