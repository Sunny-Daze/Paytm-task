import { Redis } from "ioredis";
import appConfig from "../config/app.config.js";

const redis = new Redis(appConfig.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  commandTimeout: 200,
});

redis.on("error", (err) => {
  console.error("Unexpected Redis error:", err);
});

export const connectRedis = async () => {
  await redis.connect();
  console.log("Connected to Redis");
};

export const closeRedis = async () => {
  await redis.quit();
  console.log("Redis connection closed");
};

export default redis;
