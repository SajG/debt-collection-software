// Cursor pagination over cuid ids: fetch size+1 rows, use the extra row
// to know whether a next page exists. Callers must put `{ id: "asc" }`
// last in orderBy so the cursor is deterministic under non-unique sorts.

export const PAGE_SIZES = [50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 100;

export type PageParams = { cursor: string | null; size: number };

export function parsePageParams(searchParams: {
  cursor?: string;
  size?: string;
}): PageParams {
  const requested = Number(searchParams.size);
  const size = (PAGE_SIZES as readonly number[]).includes(requested)
    ? requested
    : DEFAULT_PAGE_SIZE;
  return { cursor: searchParams.cursor || null, size };
}

/** Prisma findMany args for one page (+1 row to detect a next page). */
export function pageArgs({ cursor, size }: PageParams) {
  return {
    take: size + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/** Trim the +1 row and report whether more pages exist. */
export function pageResult<T extends { id: string }>(
  rows: T[],
  { size }: PageParams
): { rows: T[]; hasNext: boolean; nextCursor: string | null } {
  const hasNext = rows.length > size;
  const page = hasNext ? rows.slice(0, size) : rows;
  return {
    rows: page,
    hasNext,
    nextCursor: hasNext ? page[page.length - 1].id : null,
  };
}
