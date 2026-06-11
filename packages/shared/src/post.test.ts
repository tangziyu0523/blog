import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode } from './errors.ts';
import type { PostDetail } from './post.ts';

test('new blog error codes exist', () => {
  assert.equal(ErrorCode.POST_NOT_FOUND, 'POST_NOT_FOUND');
  assert.equal(ErrorCode.FORBIDDEN, 'FORBIDDEN');
  assert.equal(ErrorCode.SLUG_TAKEN, 'SLUG_TAKEN');
});

test('PostDetail shape compiles', () => {
  const d: PostDetail = {
    id: 'p1', slug: 's', title: 't', summary: null, tags: [],
    status: 'DRAFT', likeCount: 0, publishedAt: null,
    author: { id: 'u1', nickname: 'n', avatarUrl: null },
    contentMd: '# hi', createdAt: 'x', updatedAt: 'x', viewerLiked: false,
  };
  assert.equal(d.status, 'DRAFT');
});
