export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

export const httpError = (
  statusCode: number,
  message: string,
  options?: ErrorOptions,
): never => {
  throw new AppError(statusCode, message, options);
};
