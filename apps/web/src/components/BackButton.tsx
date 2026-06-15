"use client";

import { useRouter } from "next/navigation";

/**
 * Browser-history back control for sub-pages. Using router.back() lets the browser
 * restore the previous scroll position (e.g. the reader's place in the home list).
 */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="返回"
      className={`mb-6 inline-flex items-center gap-1 text-sm ${className ?? ""}`}
      style={{ color: "var(--text-2)" }}
    >
      ← 返回
    </button>
  );
}
