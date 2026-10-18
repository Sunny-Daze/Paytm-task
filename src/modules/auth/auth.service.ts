import type { UserRole } from "../../constants/index.js";
import { signJwt } from "../../shared/auth/jwt.js";
import { httpError } from "../../shared/http/httpError.js";
import {
  getUserById,
  upsertUser as upsertUserRepo,
} from "./auth.repository.js";
import type { SafeUser } from "./auth.types.js";

export const upsertUser = async (input: {
  username: string;
  role: UserRole;
}): Promise<SafeUser & { token: string }> => {
  const user = await upsertUserRepo(input);

  const token = signJwt({ id: user.id, role: user.role });

  return { ...user, token };
};

export const getMe = async (id: string): Promise<SafeUser> => {
  const user = await getUserById(id);

  if (!user) {
    return httpError(404, "User not found");
  }

  return { id: user.id, role: user.role };
};
