export const bestEffort = async <T>(
  label: string,
  op: () => Promise<T>,
  fallback: T,
): Promise<T> => {
  try {
    return await op();
  } catch (err) {
    console.warn(
      `[cache] ${label} failed, falling back to Postgres:`,
      (err as Error).message,
    );
    return fallback;
  }
};
