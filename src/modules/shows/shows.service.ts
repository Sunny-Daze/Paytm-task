import { httpError } from "../../shared/http/httpError.js";
import { SingleFlight } from "../../shared/concurrency/keyedGate.js";
import { cacheShowMeta, getCachedShowMeta } from "./shows.cache.js";
import {
  getShowMetaById,
  getShowStateById,
  insertShowWithSeats,
} from "./shows.repository.js";
import type {
  CreateShowInput,
  Show,
  ShowMeta,
  ShowState,
} from "./shows.types.js";

export const createShow = async (input: CreateShowInput): Promise<Show> => {
  const show = await insertShowWithSeats(input);

  await cacheShowMeta(show.id, {
    price_paise: input.price_paise,
    per_user_limit: input.per_user_limit,
  });

  return show;
};

const showMetaLoads = new SingleFlight<ShowMeta | undefined>();

export const getShowMeta = async (
  id: string,
): Promise<ShowMeta | undefined> => {
  const cached = await getCachedShowMeta(id);

  if (cached) {
    return cached;
  }

  return showMetaLoads.do(id, async () => {
    const meta = await getShowMetaById(id);

    if (meta) {
      await cacheShowMeta(id, meta);
    }

    return meta;
  });
};

export const getShowState = async (id: string): Promise<ShowState> => {
  const show = await getShowStateById(id);

  if (!show) {
    return httpError(404, "Show not found");
  }

  return show;
};
