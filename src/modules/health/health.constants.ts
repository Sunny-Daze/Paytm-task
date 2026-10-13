export const CheckStatus = {
  OK: "ok",
  DOWN: "down",
  DEGRADED: "degraded",
} as const;

export type CheckStatus = (typeof CheckStatus)[keyof typeof CheckStatus];

export const ReadinessStatus = {
  READY: "ready",
  DEGRADED: "degraded",
  NOT_READY: "not_ready",
} as const;

export type ReadinessStatus =
  (typeof ReadinessStatus)[keyof typeof ReadinessStatus];
