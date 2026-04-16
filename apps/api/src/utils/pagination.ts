type PaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

export const parsePagination = (
  query: Record<string, any>,
  options: PaginationOptions = {}
) => {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;

  const pageRaw = Number(query.page ?? 1);
  const limitRaw = Number(query.limit ?? defaultLimit);

  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const boundedLimit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : defaultLimit;
  const limit = Math.max(1, Math.min(maxLimit, boundedLimit));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const paginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
