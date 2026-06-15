import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideHeaderVisible } from './header-visibility.ts';

test('always visible at or near the top', () => {
  assert.equal(decideHeaderVisible(50, 0, false), true);
  assert.equal(decideHeaderVisible(50, 8, false), true);
});

test('hides when scrolling down past the delta', () => {
  assert.equal(decideHeaderVisible(100, 120, true), false);
});

test('reveals when scrolling up past the delta', () => {
  assert.equal(decideHeaderVisible(200, 180, false), true);
});

test('keeps previous state on jitter below the delta', () => {
  assert.equal(decideHeaderVisible(200, 202, true), true);
  assert.equal(decideHeaderVisible(200, 198, false), false);
});
