import { api } from "./api";
import type { FollowResult, NotificationListResult, UnreadCountResult } from "@blog/shared";

export function toggleFollow(userId: string): Promise<FollowResult> {
  return api<FollowResult>(`/users/${userId}/follow`, { method: "POST" });
}

export function getFollow(userId: string): Promise<FollowResult> {
  return api<FollowResult>(`/users/${userId}/follow`);
}

export function listNotifications(cursor?: string): Promise<NotificationListResult> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<NotificationListResult>(`/notifications${qs}`);
}

export function fetchUnreadCount(): Promise<UnreadCountResult> {
  return api<UnreadCountResult>(`/notifications/unread-count`);
}

export function markNotificationRead(id: string): Promise<void> {
  return api<void>(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<void> {
  return api<void>(`/notifications/read-all`, { method: "POST" });
}

/** Base URL for the SSE EventSource (EventSource can't go through fetch's `api`). */
export const NOTIFICATIONS_STREAM_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/notifications/stream`;
