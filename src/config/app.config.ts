import "dotenv/config";
import { getEnv, getPositiveIntEnv } from "../shared/env/env.js";

const appConfig = {
  PORT: getEnv("PORT", "8000"),
  DB_URL: getEnv("DATABASE_URL"),
  REDIS_URL: getEnv("REDIS_URL"),
  JWT_SECRET: getEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: getEnv("JWT_EXPIRES_IN", "1h"),
  HOLD_TTL_SECONDS: getPositiveIntEnv("HOLD_TTL_SECONDS", 300),
};

export default appConfig;
