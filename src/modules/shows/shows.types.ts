import type z from "zod";
import type { showSchema } from "./shows.validations.js";

export type CreateShowInput = z.infer<typeof showSchema>;

export type Show = {
  id: string;
  name: string;
  price: string;
  total_seats: number;
  per_user_limit: number;
  created_at: Date;
};

export type SeatStatus = "available" | "held" | "confirmed";

export type SeatSummary = {
  seat_label: string;
  status: SeatStatus;
};

export type ShowState = {
  id: string;
  name: string;
  price_paise: number;
  total_seats: number;
  per_user_limit: number;
  created_at: Date;
  counts: Record<SeatStatus, number>;
  seats: SeatSummary[];
};

// Immutable after creation, which is what makes it safe to cache
export type ShowMeta = {
  price_paise: number;
  per_user_limit: number;
};
