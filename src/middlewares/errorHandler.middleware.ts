import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/http/httpError.js";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: err.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      console.error(`[ERROR] ${req.method} ${req.originalUrl} ->`, err);
    }

    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.code !== undefined && { code: err.code }),
      ...(err.details !== undefined && { details: err.details }),
    });
  }

  console.error(`[ERROR] ${req.method} ${req.originalUrl} ->`, err);

  res.status(500).json({
    success: false,
    error: "Internal Server Error",
  });
};
