"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationView } from "@blog/shared";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/use-notifications";
import { Avatar } from "./Avatar";

function messageOf(n: NotificationView): string {
  const who = n.actor?.nickname ?? "有人";
  const title = n.post?.title ?? "";
  if (n.type === "POST_COMMENT") return `${who} 评论了你的文章《${title}》`;
  if (n.type === "COMMENT_REPLY") return `${who} 回复了你的评论`;
  return `${who} 发布了新文章《${title}》`;
}

function hrefOf(n: NotificationView): string {
  if (!n.post) return "#";
  return n.commentId ? `/posts/${n.post.slug}#comment-${n.commentId}` : `/posts/${n.post.slug}`;
}

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { unread, items, markAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (loading) return <span style={{ width: 32, height: 32 }} aria-hidden="true" />;

  if (!user) {
    return (
      <Link href="/login" style={{ color: "var(--text-2)" }}>
        登录
      </Link>
    );
  }

  async function onLogout() {
    await logout();
    setOpen(false);
    router.push("/");
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-label="用户菜单" className="flex">
        <span className="relative inline-flex">
          <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size={32} />
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
              style={{ background: "var(--accent)" }}
              aria-hidden="true"
            />
          )}
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-72 rounded-md border py-1 z-20"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>通知</span>
            {items.length > 0 && (
              <button onClick={markAll} className="text-xs" style={{ color: "var(--text-2)" }}>
                全部已读
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-auto px-1">
            {items.length === 0 ? (
              <p className="px-2 py-2 text-xs italic" style={{ color: "var(--text-3)" }}>
                暂无通知
              </p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={hrefOf(n)}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2 py-2 text-sm"
                  style={{ color: n.read ? "var(--text-3)" : "var(--text)" }}
                >
                  {messageOf(n)}
                </Link>
              ))
            )}
          </div>
          <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            设置
          </Link>
          <button
            onClick={onLogout}
            className="block w-full px-3 py-2 text-left text-sm"
            style={{ color: "var(--text-2)" }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
