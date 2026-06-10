import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode } from './errors.ts';

test('ErrorCode enum exposes auth codes', () => {
  assert.equal(ErrorCode.INVALID_CREDENTIALS, 'INVALID_CREDENTIALS');
  assert.equal(ErrorCode.REFRESH_REUSE_DETECTED, 'REFRESH_REUSE_DETECTED');
  assert.equal(ErrorCode.EMAIL_TAKEN_BIND_REQUIRED, 'EMAIL_TAKEN_BIND_REQUIRED');
});
