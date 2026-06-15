/** Navigation kind used to decide whether to restore the home scroll position. */
export type NavType = 'pop' | 'push';

/**
 * Parse a stored scroll value. Returns a non-negative integer, or null when the
 * value is missing, non-numeric, or negative.
 */
export function parseSavedScroll(raw: string | null): number | null {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}
