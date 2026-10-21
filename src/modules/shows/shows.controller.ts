import type { Request, Response } from "express";
import { showIdParamsSchema, showSchema } from "./shows.validations.js";
import {
  createShow as createShowService,
  getShowState,
} from "./shows.service.js";
import { success } from "../../shared/http/httpSuccess.js";

export const createShow = async (req: Request, res: Response) => {
  const input = showSchema.parse(req.body);
  const result = await createShowService(input);

  res.json(success(result));
};

export const getShow = async (req: Request, res: Response) => {
  const { id } = showIdParamsSchema.parse(req.params);
  const show = await getShowState(id);

  res.json(success(show));
};
