"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiClientError } from "@/lib/api";
import { getFollow, toggleFollow } from "@/lib/notifications";

export function FollowButton({ authorId }: { authorId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getFollow(authorId)
      .then((r) => {
        if (!active) return;
        setFollowing(r.following);
        setCount(r.followerCount);
        setReady(true);
      })
      .catch(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [authorId]);

  if (user?.id === authorId) return null;

  async function toggle() {
    if (!user) return router.push("/login");
    if (busy) return;
    setBusy(true);
    const pf = following;
    const pc = count;
    setFollowing(!pf);
    setCount(pc + (pf ? -1 : 1));
    try {
      const r = await toggleFollow(authorId);
      setFollowing(r.following);
      setCount(r.followerCount);
    } catch (e) {
      setFollowing(pf);
      setCount(pc);
      if (e instanceof ApiClientError && (e.code === "TOKEN_INVALID" || e.code === "TOKEN_EXPIRED")) {
        router.push("/login");
        return;
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy || !ready}
      className="rounded-full border px-4 py-1 text-sm disabled:opacity-50"
      style={{ borderColor: "var(--border)", color: following ? "var(--text-3)" : "var(--text-1)" }}
    >
      {following ? "已关注" : "关注"} · {count}
    </button>
  );
}
