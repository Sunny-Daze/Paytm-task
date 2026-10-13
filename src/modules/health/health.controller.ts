import type { Request, Response } from "express";
import { CheckStatus } from "./health.constants.js";
import { getReadiness } from "./health.service.js";

export const checkLiveness = (_req: Request, res: Response) => {
  res.status(200).json({ status: CheckStatus.OK });
};

export const checkReadiness = async (_req: Request, res: Response) => {
  const { ready, ...body } = await getReadiness();
  res.status(ready ? 200 : 503).json(body);
};
