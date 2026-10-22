export const jitteredTtlSeconds = (baseSeconds: number, spread = 0.1): number =>
  Math.round(baseSeconds * (1 - spread + Math.random() * 2 * spread));
