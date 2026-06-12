import type { PostAuthor } from './post.ts';

export type CommentStatus = 'VISIBLE' | 'DELETED';

export interface CommentQuote {
  id: string;
  authorNickname: string;
  snippet: string; // 纯文本、截断
}

export interface CommentView {
  id: string;
  author: PostAuthor;
  contentMd: string;       // status==='DELETED' 时为 ''
  status: CommentStatus;
  likeCount: number;
  viewerLiked: boolean;
  editedAt: string | null; // ISO
  createdAt: string;       // ISO
  quoted: CommentQuote | null;
  replyCount: number;      // 回复条目恒为 0
  replies: CommentView[];  // 顶层带前 3 条；回复为 []
}

export interface CommentListResult {
  items: CommentView[];
  nextCursor: string | null;
  commentCount: number;    // Post.commentCount（所有可见评论）
}

export interface CommentRepliesResult {
  items: CommentView[];
  nextCursor: string | null;
}
