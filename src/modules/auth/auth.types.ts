import type { UserRole } from "../../constants/index.js";

export type SafeUser = {
  id: string;
  role: UserRole;
};
