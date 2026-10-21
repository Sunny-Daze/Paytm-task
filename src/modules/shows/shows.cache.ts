import redis from "../../db/redis.db.js";
import { bestEffort } from "../../shared/cache/bestEffort.js";
import type { ShowMeta } from "./shows.types.js";

const SHOW_META_TTL_SECONDS = 24 * 60 * 60;

const showMetaKey = (showId: string) => `show:${showId}:meta`;

export const getCachedShowMeta = (showId: string): Promise<ShowMeta | null> =>
  bestEffort(
    "get show meta",
    async () => {
      const raw = await redis.get(showMetaKey(showId));
      return raw ? (JSON.parse(raw) as ShowMeta) : null;
    },
    null,
  );

export const cacheShowMeta = (showId: string, meta: ShowMeta): Promise<void> =>
  bestEffort(
    "set show meta",
    async () => {
      await redis.set(
        showMetaKey(showId),
        JSON.stringify(meta),
        "EX",
        SHOW_META_TTL_SECONDS,
      );
    },
    undefined,
  );
