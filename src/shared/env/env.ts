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
};
