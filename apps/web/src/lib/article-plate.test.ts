import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSlug, pickPlateIndex } from './article-plate.ts';

test('hashSlug is deterministic and non-negative', () => {
  assert.equal(hashSlug('hello-world'), hashSlug('hello-world'));
  assert.ok(hashSlug('hello-world') >= 0);
  assert.ok(hashSlug('') >= 0);
});

test('pickPlateIndex is stable for a slug and within range', () => {
  for (const slug of ['a', 'naturalist', 'systems-and-software', 'b-2', '中文']) {
    const i = pickPlateIndex(slug, 12);
    assert.ok(Number.isInteger(i));
    assert.ok(i >= 0 && i < 12);
    assert.equal(i, pickPlateIndex(slug, 12)); // stable
  }
});

test('pickPlateIndex guards a non-positive count', () => {
  assert.equal(pickPlateIndex('a', 0), 0);
  assert.equal(pickPlateIndex('a', -3), 0);
});
