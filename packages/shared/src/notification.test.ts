import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode } from './errors.ts';
import type { NotificationView, FollowResult } from './notification.ts';

test('m4b error codes exist', () => {
  assert.equal(ErrorCode.CANNOT_FOLLOW_SELF, 'CANNOT_FOLLOW_SELF');
  assert.equal(ErrorCode.NOTIFICATION_NOT_FOUND, 'NOTIFICATION_NOT_FOUND');
  assert.equal(ErrorCode.USER_NOT_FOUND, 'USER_NOT_FOUND');
});

test('NotificationView shape compiles', () => {
  const v: NotificationView = {
    id: 'n1', type: 'POST_COMMENT', category: 'interaction',
    actor: { id: 'u1', nickname: 'N', avatarUrl: null },
    post: { slug: 's', title: 't' }, commentId: 'c1', read: false, createdAt: 'x',
  };
  const f: FollowResult = { following: true, followerCount: 1 };
  assert.equal(v.category, 'interaction');
  assert.equal(f.following, true);
});
