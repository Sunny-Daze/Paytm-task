export type ReserveSeatsInput = {
  showId: string;
  userId: string;
  seats: string[];
  idempotencyKey: string;
};

export type ReservationStatus = "held" | "confirmed" | "cancelled" | "expired";

export type ReservationResponse = {
  reservation_id: string;
  show_id: string;
  user_id: string;
  seats: string[];
  amount_paise: number;
  status: "held" | "confirmed";
  hold_expires_at: string | null;
};

export type ReserveSeatsResult = {
  statusCode: number;
  body: ReservationResponse;
  replayed: boolean;
};

export type ConfirmReservationResult = {
  body: ReservationResponse;
  // true if the reservation was already confirmed
  replayed: boolean;
};

export type ExpireReservationResponse = {
  reservation_id: string;
  show_id: string;
  status: "expired";
  released_seats: string[];
};

export type ExpireReservationResult = {
  body: ExpireReservationResponse;
  replayed: boolean;
};

export type LockedSeat = {
  id: string;
  seat_label: string;
  status: "available" | "held" | "confirmed";
  // available or held
  claimable: boolean;
};

export type LockedReservation = {
  id: string;
  show_id: string;
  user_id: string;
  amount_paise: number;
  status: ReservationStatus;
  hold_expires_at: Date | null;
  hold_expired: boolean;
};

export type IdempotencyRecord = {
  request_hash: string;
  response_status: number | null;
  response_body: ReservationResponse | null;
};
