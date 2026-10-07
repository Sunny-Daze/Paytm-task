import { getEnv } from "../shared/env/env.js";

const appConfig = {
  PORT: getEnv("PORT", "8000"),
};

export default appConfig;
