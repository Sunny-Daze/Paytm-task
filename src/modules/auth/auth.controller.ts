import type { Request, Response } from "express";
import { authSchema } from "./auth.validation.js";
import { getMe, upsertUser } from "./auth.service.js";
import { success } from "../../shared/http/httpSuccess.js";
import { httpError } from "../../shared/http/httpError.js";

export const login = async (req: Request, res: Response) => {
  const input = authSchema.parse(req.body);
  const result = await upsertUser(input);

  res.json(success(result));
};

export const me = async (req: Request, res: Response) => {
  if (!req.user) {
    return httpError(401, "Unauthorized");
  }

  const user = await getMe(req.user.id);

  res.json(success(user));
};
