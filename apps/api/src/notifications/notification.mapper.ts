import type { Notification, User, Post, Comment, Prisma } from '@prisma/client';
import type {
  NotificationView,
  NotificationCategory,
  NotificationType,
} from '@blog/shared';

type Actor = Pick<User, 'id' | 'nickname' | 'avatarUrl'>;

export type NotificationRow = Notification & {
  actor: Actor | null;
  post: Pick<Post, 'slug' | 'title'> | null;
  comment: Pick<Comment, 'id'> | null;
};

export const NOTIF_INCLUDE = {
  actor: { select: { id: true, nickname: true, avatarUrl: true } },
  post: { select: { slug: true, title: true } },
  comment: { select: { id: true } },
} satisfies Prisma.NotificationInclude;

export function categoryOf(type: NotificationType): NotificationCategory {
  return type === 'NEW_POST' ? 'subscription' : 'interaction';
}

export function toNotificationView(n: NotificationRow): NotificationView {
  return {
    id: n.id,
    type: n.type,
    category: categoryOf(n.type),
    actor: n.actor
      ? {
          id: n.actor.id,
          nickname: n.actor.nickname,
          avatarUrl: n.actor.avatarUrl,
        }
      : null,
    post: n.post ? { slug: n.post.slug, title: n.post.title } : null,
    commentId: n.commentId ?? null,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}
