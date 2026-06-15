interface HeaderOpts {
  /** Always show when scrollTop is at or below this (px). */
  topThreshold?: number;
  /** Ignore movements smaller than this (px) to avoid jitter. */
  delta?: number;
}

/**
 * Decide whether the auto-hiding header should be visible.
 * Always visible near the top; hide on a downward move past `delta`; reveal on an
 * upward move past `delta`; otherwise keep the previous state.
 */
export function decideHeaderVisible(
  prevY: number,
  curY: number,
  prevVisible: boolean,
  opts: HeaderOpts = {},
): boolean {
  const topThreshold = opts.topThreshold ?? 8;
  const delta = opts.delta ?? 6;
  if (curY <= topThreshold) return true;
  if (curY - prevY > delta) return false;
  if (prevY - curY > delta) return true;
  return prevVisible;
}
