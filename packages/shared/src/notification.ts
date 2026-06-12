export type NotificationType = 'POST_COMMENT' | 'COMMENT_REPLY' | 'NEW_POST';
export type NotificationCategory = 'interaction' | 'subscription';

export interface NotificationView {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  actor: { id: string; nickname: string; avatarUrl: string | null } | null;
  post: { slug: string; title: string } | null;
  commentId: string | null;
  read: boolean;
  createdAt: string; // ISO
}

export interface NotificationListResult {
  items: NotificationView[];
  nextCursor: string | null;
}

export interface UnreadCountResult {
  count: number;
}

export interface FollowResult {
  following: boolean;
  followerCount: number;
}
