import type { NextFunction, Request, Response } from "express";
import { verifyJwt } from "../shared/auth/jwt.js";
import { httpError } from "../shared/http/httpError.js";

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return httpError(401, "Missing or malformed Authorization header");
  }

  try {
    req.user = verifyJwt(header.slice("Bearer ".length));
  } catch (err) {
    return httpError(401, "Invalid or expired token", { cause: err });
  }

  next();
};
