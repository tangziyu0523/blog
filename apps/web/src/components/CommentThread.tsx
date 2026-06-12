"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommentView } from "@blog/shared";
import { ApiClientError } from "@/lib/api";
import {
  createComment,
  deleteComment,
  editComment,
  likeComment,
  listReplies,
} from "@/lib/comments";
import { CommentBody } from "./CommentBody";
import { CommentComposer } from "./CommentComposer";

function relTime(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function CommentRow({
  c,
  postId,
  currentUserId,
  postAuthorId,
  onReplyCreated,
  onRemoved,
}: {
  c: CommentView;
  postId: string;
  currentUserId: string | null;
  postAuthorId: string;
  onReplyCreated?: (reply: CommentView) => void;
  onRemoved: (id: string) => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(c.viewerLiked);
  const [count, setCount] = useState(c.likeCount);
  const [likeBusy, setLikeBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [content, setContent] = useState(c.contentMd);
  const [editedAt, setEditedAt] = useState(c.editedAt);
  const [status, setStatus] = useState(c.status);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canEdit = currentUserId === c.author.id && status === "VISIBLE";
  const canDelete =
    status === "VISIBLE" && (currentUserId === c.author.id || currentUserId === postAuthorId);

  function authGuard(e: unknown): boolean {
    if (e instanceof ApiClientError && (e.code === "TOKEN_INVALID" || e.code === "TOKEN_EXPIRED")) {
      router.push("/login");
      return true;
    }
    return false;
  }

  async function toggleLike() {
    if (!currentUserId) return router.push("/login");
    if (likeBusy) return;
    setLikeBusy(true);
    const pl = liked;
    const pc = count;
    setLiked(!pl);
    setCount(pc + (pl ? -1 : 1));
    try {
      const r = await likeComment(c.id);
      setLiked(r.liked);
      setCount(r.likeCount);
    } catch (e) {
      setLiked(pl);
      setCount(pc);
      if (!authGuard(e)) throw e;
    } finally {
      setLikeBusy(false);
    }
  }

  async function remove() {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deleteComment(c.id);
      setStatus("DELETED");
      onRemoved(c.id);
    } catch (e) {
      if (!authGuard(e)) throw e;
    } finally {
      setDeleteBusy(false);
    }
  }

  if (status === "DELETED") {
    return <p className="py-2 text-sm italic" style={{ color: "var(--text-3)" }}>[已删除]</p>;
  }

  return (
    <div className="py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{c.author.nickname}</span>
        <span className="text-xs italic" style={{ color: "var(--text-3)" }}>
          {relTime(c.createdAt)}{editedAt ? " · 已编辑" : ""}
        </span>
      </div>

      {c.quoted && (
        <div className="mt-1 border-l-2 pl-2 text-xs italic" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
          {c.quoted.authorNickname}：{c.quoted.snippet}
        </div>
      )}

      {editing ? (
        <CommentComposer
          placeholder="编辑评论…"
          initial={content}
          submitLabel="保存"
          onCancel={() => setEditing(false)}
          onSubmit={async (text) => {
            try {
              const u = await editComment(c.id, text);
              setContent(u.contentMd);
              setEditedAt(u.editedAt);
              setEditing(false);
            } catch (e) {
              if (!authGuard(e)) throw e;
            }
          }}
        />
      ) : (
        <div className="mt-1"><CommentBody markdown={content} /></div>
      )}

      <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: "var(--text-2)" }}>
        <button onClick={toggleLike} disabled={likeBusy}>{liked ? "♥" : "♡"} {count}</button>
        {onReplyCreated && (
          <button onClick={() => (currentUserId ? setReplying((v) => !v) : router.push("/login"))}>回复</button>
        )}
        {canEdit && <button onClick={() => setEditing((v) => !v)}>编辑</button>}
        {canDelete && (
          <button onClick={remove} disabled={deleteBusy}>
            删除
          </button>
        )}
      </div>

      {replying && onReplyCreated && (
        <CommentComposer
          placeholder={`回复 ${c.author.nickname}…`}
          submitLabel="发表回复"
          onCancel={() => setReplying(false)}
          onSubmit={async (text) => {
            try {
              const reply = await createComment(postId, { contentMd: text, parentId: c.id });
              onReplyCreated(reply);
              setReplying(false);
            } catch (e) {
              if (!authGuard(e)) throw e;
            }
          }}
        />
      )}
    </div>
  );
}

export function CommentThread({
  top,
  postId,
  currentUserId,
  postAuthorId,
  onCountChange,
}: {
  top: CommentView;
  postId: string;
  currentUserId: string | null;
  postAuthorId: string;
  onCountChange: (delta: number) => void;
}) {
  const [replies, setReplies] = useState<CommentView[]>(top.replies);
  const [replyCount, setReplyCount] = useState(top.replyCount);
  const [loadedAll, setLoadedAll] = useState(top.replies.length >= top.replyCount);
  const [loadingMore, setLoadingMore] = useState(false);

  // Deleting any comment in this thread (top or reply) soft-deletes it on the
  // server and decrements the post's commentCount — bubble that up so the
  // section header total stays accurate. Tombstones remain in the thread, so
  // replyCount (which counts all replies incl. tombstones) is left unchanged.
  function handleRemoved(): void {
    onCountChange(-1);
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      let cursor: string | null = replies.length ? replies[replies.length - 1].id : null;
      const acc: CommentView[] = [];
      do {
        const res = await listReplies(top.id, cursor ?? undefined);
        acc.push(...res.items);
        cursor = res.nextCursor;
      } while (cursor);
      setReplies((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...acc.filter((r) => !seen.has(r.id))];
      });
      setLoadedAll(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="border-b py-2" style={{ borderColor: "var(--border)" }}>
      <CommentRow
        c={top}
        postId={postId}
        currentUserId={currentUserId}
        postAuthorId={postAuthorId}
        onReplyCreated={(reply) => {
          setReplies((prev) => [...prev, reply]);
          setReplyCount((n) => n + 1);
          onCountChange(1);
        }}
        onRemoved={handleRemoved}
      />
      {replies.length > 0 && (
        <div className="ml-6 border-l pl-4" style={{ borderColor: "var(--border)" }}>
          {replies.map((r) => (
            <CommentRow
              key={r.id}
              c={r}
              postId={postId}
              currentUserId={currentUserId}
              postAuthorId={postAuthorId}
              onRemoved={handleRemoved}
            />
          ))}
        </div>
      )}
      {!loadedAll && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="ml-6 mt-1 text-xs"
          style={{ color: "var(--text-2)" }}
        >
          查看全部 {replyCount} 条回复
        </button>
      )}
    </div>
  );
}
