export function getEnv(key: string): string;
export function getEnv(key: string, fallback: string): string;
export function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];

  if (value !== undefined && value !== "") {
    return value;
  }

  if (fallback !== undefined && fallback !== "") {
    return fallback;
  }

  throw new Error(`Missing required env variable: ${key}`);
}

export const getPositiveIntEnv = (key: string, fallback: number): number => {
  const value = Number(getEnv(key, String(fallback)));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Env variable ${key} must be a positive integer`);
  }

  return value;
};
