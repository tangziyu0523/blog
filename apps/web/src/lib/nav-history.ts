import type { NavType } from './scroll-restoration';

// Module-level flag: set true when the last navigation was a browser pop
// (back/forward, including router.back()). Consumed once by the home page.
let popped = false;

/**
 * Install the global popstate listener. Returns a cleanup function.
 * Safe to call on the server (no-op).
 */
export function installPopListener(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onPop = () => {
    popped = true;
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}

/** Return the pending navigation type and reset the pop flag. */
export function consumeNavType(): NavType {
  const type: NavType = popped ? 'pop' : 'push';
  popped = false;
  return type;
}
