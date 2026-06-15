"use client";

import { useEffect } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Fires one best-effort view ping from the reader's browser on mount, so the
 * server sees the real reader IP/UA (the detail page itself is server-rendered).
 * Server-side Redis NX dedup makes a duplicate ping (e.g. React strict mode) harmless.
 */
export function ViewPing({ postId }: { postId: string }) {
  useEffect(() => {
    fetch(`${BASE}/posts/${postId}/view`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
    }).catch(() => undefined);
  }, [postId]);
  return null;
}
