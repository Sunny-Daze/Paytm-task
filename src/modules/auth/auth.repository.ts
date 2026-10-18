import db from "../../db/postgres.db.js";
import type { UserRole } from "../../constants/index.js";
import type { SafeUser } from "./auth.types.js";

export const upsertUser = async (input: {
  username: string;
  role: UserRole;
}): Promise<SafeUser> => {
  const { rows } = await db.query<SafeUser>(
    `
        INSERT INTO users (id, role, last_login_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (id) DO UPDATE SET last_login_at = NOW(), role = EXCLUDED.role
        RETURNING id, role
    `,
    [input.username, input.role],
  );

  return rows[0]!;
};

export const getUserById = async (
  id: string,
): Promise<SafeUser | undefined> => {
  const { rows } = await db.query<SafeUser>(
    `
        SELECT id, role
        FROM users
        WHERE id = $1
    `,
    [id],
  );

  return rows[0];
};
