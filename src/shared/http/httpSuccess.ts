interface successResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export const success = <T>(
  data: T,
  meta?: Record<string, unknown>,
): successResponse<T> => {
  return meta ? { success: true, data, meta } : { success: true, data };
};
