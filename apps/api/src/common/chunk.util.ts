/** Keeps SQLite's bound-parameter limit out of reach for `in:` filters and createMany. */
export const DB_CHUNK = 400;

/** Splits `items` into consecutive batches of at most `size`. */
export function chunk<T>(items: readonly T[], size = DB_CHUNK): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}
