import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type {
  NotificationView,
  NotificationListResult,
  NotificationType,
} from '@blog/shared';
import { FollowsService } from './follows.service';
import { NotificationStreamService } from './notification-stream.service';
import { NOTIF_INCLUDE, toNotificationView } from './notification.mapper';

interface NewComment {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  quotedId: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly follows: FollowsService,
    private readonly stream: NotificationStreamService,
  ) {}

  async emit(
    userId: string,
    type: NotificationType,
    refs: { actorId?: string; postId?: string; commentId?: string },
  ): Promise<NotificationView> {
    const row = await this.prisma.notification.create({
      data: {
        userId,
        type,
        actorId: refs.actorId ?? null,
        postId: refs.postId ?? null,
        commentId: refs.commentId ?? null,
      },
      include: NOTIF_INCLUDE,
    });
    const view = toNotificationView(row);
    this.stream.push(userId, view);
    return view;
  }

  /** Generate the right notification for a freshly-created comment. Never throws. */
  async notifyForNewComment(comment: NewComment): Promise<void> {
    try {
      if (comment.parentId === null) {
        const post = await this.prisma.post.findUnique({
          where: { id: comment.postId },
          select: { authorId: true },
        });
        if (post && post.authorId !== comment.authorId) {
          await this.emit(post.authorId, 'POST_COMMENT', {
            actorId: comment.authorId,
            postId: comment.postId,
            commentId: comment.id,
          });
        }
      } else {
        const targetId = comment.quotedId ?? comment.parentId;
        const target = await this.prisma.comment.findUnique({
          where: { id: targetId },
          select: { authorId: true },
        });
        if (target && target.authorId !== comment.authorId) {
          await this.emit(target.authorId, 'COMMENT_REPLY', {
            actorId: comment.authorId,
            postId: comment.postId,
            commentId: comment.id,
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `notifyForNewComment failed for comment ${comment.id}`,
        err as Error,
      );
    }
  }

  /** Fan out NEW_POST to the author's followers. Never throws. */
  async notifyNewPost(post: { id: string; authorId: string }): Promise<void> {
    try {
      const followerIds = await this.follows.listFollowerIds(post.authorId);
      for (const followerId of followerIds) {
        await this.emit(followerId, 'NEW_POST', {
          actorId: post.authorId,
          postId: post.id,
        });
      }
    } catch (err) {
      this.logger.error(
        `notifyNewPost failed for post ${post.id}`,
        err as Error,
      );
    }
  }

  async list(
    userId: string,
    cursor?: string,
    take = 20,
  ): Promise<NotificationListResult> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: NOTIF_INCLUDE,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map(toNotificationView),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({
      where: { id },
      select: { userId: true, readAt: true },
    });
    if (!n)
      throw new AppError(
        ErrorCode.NOTIFICATION_NOT_FOUND,
        404,
        'Notification not found',
      );
    if (n.userId !== userId)
      throw new AppError(ErrorCode.FORBIDDEN, 403, 'Not your notification');
    if (n.readAt === null) {
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
