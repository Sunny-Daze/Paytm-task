import db from "../../db/postgres.db.js";
import redis from "../../db/redis.db.js";
import { CheckStatus, ReadinessStatus } from "./health.constants.js";

const CHECK_TIMEOUT_MS = 1000;
const REDIS_REQUIRED = false;

const withTimeout = async <T>(
  p: Promise<T>,
  ms: number,
  name: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${name}`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const checkPostgres = async (): Promise<CheckStatus> => {
  try {
    await withTimeout(db.query("SELECT 1"), CHECK_TIMEOUT_MS, "Postgres");
    return CheckStatus.OK;
  } catch {
    return CheckStatus.DOWN;
  }
};

const checkRedis = async (): Promise<CheckStatus> => {
  try {
    await withTimeout(redis.ping(), CHECK_TIMEOUT_MS, "Redis");
    return CheckStatus.OK;
  } catch {
    return CheckStatus.DOWN;
  }
};

export const getReadiness = async () => {
  const [postgresStatus, redisStatus] = await Promise.all([
    checkPostgres(),
    checkRedis(),
  ]);

  const ready =
    postgresStatus === CheckStatus.OK &&
    (!REDIS_REQUIRED || redisStatus === CheckStatus.OK);

  return {
    ready,
    status: ready
      ? redisStatus === CheckStatus.OK
        ? ReadinessStatus.READY
        : ReadinessStatus.DEGRADED
      : ReadinessStatus.NOT_READY,
    checks: {
      postgres: postgresStatus,
      redis:
        redisStatus === CheckStatus.OK
          ? CheckStatus.OK
          : REDIS_REQUIRED
            ? CheckStatus.DOWN
            : CheckStatus.DEGRADED,
    },
  };
};
