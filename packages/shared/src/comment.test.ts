import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode } from './errors.ts';
import type { CommentView, CommentListResult } from './comment.ts';

test('comment error codes exist', () => {
  assert.equal(ErrorCode.COMMENT_NOT_FOUND, 'COMMENT_NOT_FOUND');
});

test('CommentView shape compiles', () => {
  const v: CommentView = {
    id: 'c1',
    author: { id: 'u1', nickname: 'n', avatarUrl: null },
    contentMd: 'hi',
    status: 'VISIBLE',
    likeCount: 0,
    viewerLiked: false,
    editedAt: null,
    createdAt: 'x',
    quoted: null,
    replyCount: 0,
    replies: [],
  };
  const list: CommentListResult = { items: [v], nextCursor: null, commentCount: 1 };
  assert.equal(list.items[0].status, 'VISIBLE');
});
