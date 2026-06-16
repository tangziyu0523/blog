import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSrc, validateImageFile } from './image-upload.ts';

test('imageSrc joins the public base and the key', () => {
  assert.equal(
    imageSrc('images/u1/x.webp'),
    'http://localhost:9000/blog/images/u1/x.webp',
  );
});

test('validateImageFile accepts a small jpeg', () => {
  assert.doesNotThrow(() =>
    validateImageFile({ type: 'image/jpeg', size: 1000 } as File),
  );
});

test('validateImageFile rejects an unsupported type', () => {
  assert.throws(() => validateImageFile({ type: 'image/gif', size: 1000 } as File), {
    code: 'INVALID_UPLOAD',
  });
});

test('validateImageFile rejects a file over 10MB', () => {
  assert.throws(
    () => validateImageFile({ type: 'image/png', size: 11 * 1024 * 1024 } as File),
    { code: 'INVALID_UPLOAD' },
  );
});
