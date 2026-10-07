export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const httpError = (statusCode: number, message: string) => {
    throw new AppError(statusCode, message);
}