import { api } from "./api";
import type {
  CommentListResult,
  CommentRepliesResult,
  CommentView,
  LikeResult,
} from "@blog/shared";

export function listComments(postId: string, cursor?: string): Promise<CommentListResult> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<CommentListResult>(`/posts/${postId}/comments${qs}`);
}

export function listReplies(commentId: string, cursor?: string): Promise<CommentRepliesResult> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<CommentRepliesResult>(`/comments/${commentId}/replies${qs}`);
}

export function createComment(
  postId: string,
  body: { contentMd: string; parentId?: string; quotedId?: string },
): Promise<CommentView> {
  return api<CommentView>(`/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function editComment(id: string, contentMd: string): Promise<CommentView> {
  return api<CommentView>(`/comments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ contentMd }),
  });
}

export function deleteComment(id: string): Promise<void> {
  return api<void>(`/comments/${id}`, { method: "DELETE" });
}

export function likeComment(id: string): Promise<LikeResult> {
  return api<LikeResult>(`/comments/${id}/like`, { method: "POST" });
}
