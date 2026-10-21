export type AppErrorOptions = ErrorOptions & {
  code?: string;
  details?: unknown;
};

export class AppError extends Error {
  public readonly code: string | undefined;
  public readonly details: unknown;

  constructor(
    public statusCode: number,
    message: string,
    options: AppErrorOptions = {},
  ) {
    const { code, details, ...errorOptions } = options;
    super(message, errorOptions);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export const httpError = (
  statusCode: number,
  message: string,
  options?: AppErrorOptions,
): never => {
  throw new AppError(statusCode, message, options);
};
