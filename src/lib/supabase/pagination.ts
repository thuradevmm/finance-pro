type SupabasePageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type FetchSupabaseRowsOptions = {
  limit?: number;
  pageSize?: number;
};

/**
 * PostgREST commonly caps one response at 1,000 rows. Financial totals must
 * never silently become partial after a user crosses that threshold, so
 * ledger readers page until the requested limit or the actual end of data.
 */
export async function fetchSupabaseRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<SupabasePageResult<T>>,
  options: FetchSupabaseRowsOptions = {},
) {
  const pageSize = Math.max(Math.trunc(options.pageSize ?? 1_000), 1);
  const requestedLimit = options.limit && options.limit > 0
    ? Math.trunc(options.limit)
    : Number.POSITIVE_INFINITY;
  const rows: T[] = [];

  while (rows.length < requestedLimit) {
    const remaining = requestedLimit - rows.length;
    const requestSize = Number.isFinite(remaining) ? Math.min(pageSize, remaining) : pageSize;
    const from = rows.length;
    const to = from + requestSize - 1;
    const result = await fetchPage(from, to);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < requestSize) break;
  }

  return rows;
}
