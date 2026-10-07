import { Pool } from "pg";
import appConfig from "../config/app.config.js";

const db = new Pool({
  connectionString: appConfig.DB_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

(async () => {
  try {
    await db.query("SELECT 1");
    console.log("Connected to PostgreSQL");
  } catch (err) {
    console.error("PostgreSQL connection error:", err);
    process.exit(1);
  }
})();

db.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err);
});

const shutdown = async () => {
  try {
    await db.end();
    console.log("PostgreSQL connection closed");
    process.exit(0);
  } catch (err) {
    console.error("Error closing PostgreSQL connection:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default db;
