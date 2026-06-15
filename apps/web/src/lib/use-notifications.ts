"use client";

import { useEffect, useState, startTransition } from "react";
import type { NotificationView } from "@blog/shared";
import { useAuth } from "@/lib/auth-context";
import {
  NOTIFICATIONS_STREAM_URL,
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications";

export interface NotificationsState {
  unread: number;
  items: NotificationView[];
  markAll: () => Promise<void>;
}

/** Live notifications for the signed-in user (initial fetch + SSE stream). */
export function useNotifications(): NotificationsState {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationView[]>([]);

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

  async function markAll(): Promise<void> {
    await markAllNotificationsRead();
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return { unread, items, markAll };
}
