/** sessionStorage key: the reader's scroll offset *within* the article list (px). */
export const LIST_OFFSET_KEY = 'home:listOffset';
/** sessionStorage key: a one-shot intent to land on the list (set by "文章列表"). */
export const TO_INDEX_KEY = 'home:toIndex';
/** window event: "文章列表" was clicked while already on the home route. */
export const SCROLL_TO_INDEX_EVENT = 'home:scroll-to-index';
/** window event: the logo was clicked while already on the home route. */
export const HOME_INTRO_EVENT = 'home:intro';

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
