/** Stable 32-bit-ish string hash (non-negative). */
export function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (Math.imul(h, 31) + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Pick a stable plate index in [0, count) for a slug. The same article always
 * maps to the same plate; different slugs spread across the set. Guards count<=0.
 */
export function pickPlateIndex(slug: string, count: number): number {
  if (count <= 0) return 0;
  return hashSlug(slug) % count;
}
