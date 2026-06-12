import type { Comment, User, Prisma } from '@prisma/client';
import type { CommentView, CommentQuote } from '@blog/shared';

const SNIPPET_MAX = 80;

type Author = Pick<User, 'id' | 'nickname' | 'avatarUrl'>;

export type CommentRow = Comment & {
  author: Author;
  quoted: (Comment & { author: Author }) | null;
};

export const COMMENT_INCLUDE = {
  author: { select: { id: true, nickname: true, avatarUrl: true } },
  quoted: {
    include: {
      author: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.CommentInclude;

function toQuote(q: CommentRow['quoted']): CommentQuote | null {
  if (!q) return null;
  const text = q.status === 'DELETED' ? '[已删除]' : q.contentMd;
  const snippet =
    text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text;
  return { id: q.id, authorNickname: q.author.nickname, snippet };
}

export function toCommentView(
  row: CommentRow,
  viewerLiked: boolean,
  replyCount: number,
  replies: CommentView[],
): CommentView {
  const deleted = row.status === 'DELETED';
  return {
    id: row.id,
    author: {
      id: row.author.id,
      nickname: row.author.nickname,
      avatarUrl: row.author.avatarUrl,
    },
    contentMd: deleted ? '' : row.contentMd,
    status: row.status,
    likeCount: row.likeCount,
    viewerLiked,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    quoted: toQuote(row.quoted),
    replyCount,
    replies,
  };
}
