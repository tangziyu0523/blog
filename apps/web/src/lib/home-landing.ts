import type { NavType } from './scroll-restoration';

/** sessionStorage key: the reader's scroll offset *within* the article list (px). */
export const LIST_OFFSET_KEY = 'home:listOffset';
/** sessionStorage key: a one-shot intent to land on the list (set by "文章列表"). */
export const TO_INDEX_KEY = 'home:toIndex';
/** window event: "文章列表" was clicked while already on the home route. */
export const SCROLL_TO_INDEX_EVENT = 'home:scroll-to-index';
/** window event: the logo was clicked while already on the home route. */
export const HOME_INTRO_EVENT = 'home:intro';

/** Where the home route should position itself on mount. */
export type HomeLanding = { mode: 'top' } | { mode: 'index'; offset: number };

/**
 * Decide the home landing. Explicit "go to list" intent wins (list top). Otherwise
 * a back/forward ('pop') with a saved in-list offset restores into the list; every
 * other case (plain push, or nothing saved) shows the intro from the top.
 */
export function decideHomeLanding(
  navType: NavType,
  toIndexIntent: boolean,
  savedOffset: number | null,
): HomeLanding {
  if (toIndexIntent) return { mode: 'index', offset: 0 };
  if (navType === 'pop' && savedOffset !== null) return { mode: 'index', offset: savedOffset };
  return { mode: 'top' };
}

/** Set the one-shot "land on the list" intent (consumed on the next home mount). */
export function setToIndexIntent(): void {
  if (typeof window !== 'undefined') sessionStorage.setItem(TO_INDEX_KEY, '1');
}

/** Read and clear the "land on the list" intent. */
export function consumeToIndexIntent(): boolean {
  if (typeof window === 'undefined') return false;
  const v = sessionStorage.getItem(TO_INDEX_KEY) === '1';
  sessionStorage.removeItem(TO_INDEX_KEY);
  return v;
}
