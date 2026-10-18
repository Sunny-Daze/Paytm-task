import jwt from "jsonwebtoken";
import appConfig from "../../config/app.config.js";
import type { UserRole } from "../../constants/index.js";

export interface JwtPayload {
  id: string;
  role: UserRole;
}

export const signJwt = (payload: JwtPayload): string =>
  jwt.sign(payload, appConfig.JWT_SECRET, {
    expiresIn: appConfig.JWT_EXPIRES_IN,
  } as jwt.SignOptions);

export const verifyJwt = (token: string): JwtPayload =>
  jwt.verify(token, appConfig.JWT_SECRET) as JwtPayload;
