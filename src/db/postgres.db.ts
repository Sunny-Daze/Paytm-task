import { Pool, type PoolClient } from "pg";
import appConfig from "../config/app.config.js";

const db = new Pool({
  connectionString: appConfig.DB_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err);
});

export const connectDb = async () => {
  await db.query("SELECT 1");
  console.log("Connected to PostgreSQL");
};

export const closeDb = async () => {
  await db.end();
  console.log("PostgreSQL connection closed");
};

export const withTransaction = async <T>(
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export default db;
