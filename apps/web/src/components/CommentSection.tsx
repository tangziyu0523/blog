"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommentView } from "@blog/shared";
import { useAuth } from "@/lib/auth-context";
import { ApiClientError } from "@/lib/api";
import { createComment, listComments } from "@/lib/comments";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";

export function CommentSection({ postId, postAuthorId }: { postId: string; postAuthorId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CommentView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    listComments(postId)
      .then((res) => {
        if (!active) return;
        setItems(res.items);
        setCursor(res.nextCursor);
        setTotal(res.commentCount);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [postId]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listComments(postId, cursor);
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...res.items.filter((c) => !seen.has(c.id))];
      });
      setCursor(res.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function addTop(text: string) {
    try {
      const c = await createComment(postId, { contentMd: text });
      setItems((prev) => [c, ...prev]);
      setTotal((n) => n + 1);
    } catch (e) {
      if (e instanceof ApiClientError && (e.code === "TOKEN_INVALID" || e.code === "TOKEN_EXPIRED")) {
        router.push("/login");
        return;
      }
      throw e;
    }
  }

  return (
    <section className="mt-12">
      <h2 className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>评论 {total > 0 ? `· ${total}` : ""}</h2>
      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      {user ? (
        <CommentComposer placeholder="写下你的评论…" submitLabel="发表评论" onSubmit={addTop} />
      ) : (
        <p className="text-sm italic" style={{ color: "var(--text-2)" }}>
          <button className="underline" onClick={() => router.push("/login")}>登录</button> 后参与评论。
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm italic" style={{ color: "var(--text-3)" }}>加载中…</p>
        ) : items.length === 0 ? (
          <p className="text-sm italic" style={{ color: "var(--text-3)" }}>还没有评论，来做第一个。</p>
        ) : (
          items.map((top) => (
            <CommentThread
              key={top.id}
              top={top}
              postId={postId}
              currentUserId={user?.id ?? null}
              postAuthorId={postAuthorId}
              onCountChange={(delta) => setTotal((n) => Math.max(0, n + delta))}
            />
          ))
        )}
      </div>

      {cursor && (
        <button onClick={loadMore} disabled={loadingMore} className="mt-4 text-sm" style={{ color: "var(--text-2)" }}>
          加载更多评论
        </button>
      )}
    </section>
  );
}
