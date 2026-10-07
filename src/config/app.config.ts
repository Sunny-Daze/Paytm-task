import "dotenv/config";
import { getEnv } from "../shared/env/env.js";

const appConfig = {
  PORT: getEnv("PORT", "8000"),
  DB_URL: getEnv("DATABASE_URL"),
};

export default appConfig;
