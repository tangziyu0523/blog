export type PostStatus = 'DRAFT' | 'PUBLISHED';

export interface PostAuthor {
  id: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  tags: string[];
  status: PostStatus;
  likeCount: number;
  publishedAt: string | null; // ISO string over the wire
  author: PostAuthor;
}

export interface PostDetail extends PostSummary {
  contentMd: string;
  createdAt: string;
  updatedAt: string;
  viewerLiked: boolean;
}

export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
