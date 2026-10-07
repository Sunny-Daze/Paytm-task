import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/http/httpError.js";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const isAppError = err instanceof AppError;

  if (isAppError) {
    return res
      .status(err.statusCode)
      .json({ success: false, error: err.message });
  }

  console.error(`[ERROR] ${req.method} ${req.originalUrl} ->`, err);

  res.status(500).json({
    success: false,
    error: "Internal Server Error",
  });
};
