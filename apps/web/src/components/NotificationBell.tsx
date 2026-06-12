"use client";

import { useEffect, useState, startTransition } from "react";
import Link from "next/link";
import type { NotificationView } from "@blog/shared";
import { useAuth } from "@/lib/auth-context";
import {
  NOTIFICATIONS_STREAM_URL,
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications";

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

export function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      startTransition(() => {
        setUnread(0);
        setItems([]);
      });
      return;
    }
    let active = true;
    fetchUnreadCount().then((r) => active && setUnread(r.count)).catch(() => undefined);
    listNotifications().then((r) => active && setItems(r.items)).catch(() => undefined);

    const es = new EventSource(NOTIFICATIONS_STREAM_URL, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const view = JSON.parse(ev.data as string) as NotificationView;
        setItems((prev) => [view, ...prev]);
        setUnread((n) => n + 1);
      } catch {
        // ignore malformed event
      }
    };
    return () => {
      active = false;
      es.close();
    };
  }, [user]);

  if (!user) return null;

  async function markAll() {
    await markAllNotificationsRead();
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} style={{ color: "var(--text-2)" }} aria-label="通知">
        🔔{unread > 0 ? ` ${unread}` : ""}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-md border p-3 z-10"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>通知</span>
            <button onClick={markAll} className="text-xs" style={{ color: "var(--text-2)" }}>全部已读</button>
          </div>
          <div className="mt-2 max-h-96 overflow-auto">
            {items.length === 0 ? (
              <p className="text-xs italic" style={{ color: "var(--text-3)" }}>暂无通知</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={hrefOf(n)}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm"
                  style={{ color: n.read ? "var(--text-3)" : "var(--text-1)" }}
                >
                  {messageOf(n)}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
