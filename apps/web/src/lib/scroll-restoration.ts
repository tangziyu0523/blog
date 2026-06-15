/** Navigation kind used to decide whether to restore the home scroll position. */
export type NavType = 'pop' | 'push';

/** sessionStorage key holding the last home scrollTop (in px). */
export const HOME_SCROLL_KEY = 'home:scrollTop';

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

/**
 * Decide the home scroll target. On back/forward ('pop') with a saved position,
 * restore it; otherwise (fresh link/push, or nothing saved) start at the top.
 */
export function decideHomeScroll(navType: NavType, saved: number | null): number {
  if (navType === 'pop' && saved !== null) return saved;
  return 0;
}
