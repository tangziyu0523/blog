"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LikeResult } from "@blog/shared";
import { api, ApiClientError } from "@/lib/api";

export function LikeButton({
  postId, initialLiked, initialCount,
}: { postId: string; initialLiked: boolean; initialCount: number }) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prevLiked = liked;
    const prevCount = count;
    // optimistic flip
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    try {
      const r = await api<LikeResult>(`/posts/${postId}/like`, { method: "POST" });
      setLiked(r.liked);
      setCount(r.likeCount);
    } catch (e) {
      // revert to the pre-click state (not the stale SSR props)
      setLiked(prevLiked);
      setCount(prevCount);
      if (
        e instanceof ApiClientError &&
        (e.code === "TOKEN_INVALID" || e.code === "TOKEN_EXPIRED")
      ) {
        router.push("/login");
        return;
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={toggle} disabled={busy}
      className="rounded-full border px-5 py-2"
      style={{ borderColor: "var(--border)", color: liked ? "var(--accent)" : "var(--text-2)" }}>
      {liked ? "♥" : "♡"} {count}
    </button>
  );
}
