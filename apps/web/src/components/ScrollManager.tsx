'use client';

import { useEffect } from 'react';
import { installPopListener } from '@/lib/nav-history';

/**
 * Mounted once in the root layout. Installs the popstate listener used to detect
 * back/forward navigation for scroll restoration. (Sub-page scroll reset and home
 * positioning live in SmoothScroll, which owns the ScrollSmoother.)
 */
export function ScrollManager() {
  useEffect(() => installPopListener(), []);
  return null;
}
