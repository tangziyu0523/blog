import type { NavType } from "./scroll-restoration";

export type HomeMode = "intro" | "list";

/**
 * Kill switch for the two-mode home. When false, the home always renders in intro
 * mode (book choreography + list below, smoother engaged) — exactly the pre-round-3
 * behavior. Flip to false to instantly fall back if list mode ever misbehaves, with
 * no code revert.
 */
export const HOME_MODES_ENABLED = true;

/**
 * Decide how the home route renders. Explicit "go to list" intent or a back/forward
 * navigation lands on the list; a fresh load or a logo click plays the intro.
 */
export function decideHomeMode(navType: NavType, toIndexIntent: boolean): HomeMode {
  if (toIndexIntent) return "list";
  if (navType === "pop") return "list";
  return "intro";
}
