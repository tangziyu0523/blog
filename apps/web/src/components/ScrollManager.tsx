'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { installPopListener } from '@/lib/nav-history';

/**
 * Mounted once in the root layout. Installs the popstate listener used for
 * scroll restoration, and forces every non-home route to open at the top.
 * The home route is handled by SmoothScroll (it owns the ScrollSmoother).
 */
export function ScrollManager() {
  const pathname = usePathname();

  useEffect(() => installPopListener(), []);

  useEffect(() => {
    if (pathname === '/') return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
