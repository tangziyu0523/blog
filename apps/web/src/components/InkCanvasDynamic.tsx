"use client";

import dynamic from "next/dynamic";

// `ssr: false` must live inside a Client Component (Next.js constraint), so the
// dynamic import is isolated here and re-exported for server pages to consume.
export const InkCanvas = dynamic(
  () => import("./InkCanvas").then((m) => ({ default: m.InkCanvas })),
  { ssr: false },
);
