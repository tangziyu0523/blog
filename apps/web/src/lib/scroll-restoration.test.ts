import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSavedScroll } from './scroll-restoration.ts';

test('parseSavedScroll returns null for missing/invalid/negative values', () => {
  assert.equal(parseSavedScroll(null), null);
  assert.equal(parseSavedScroll(''), null);
  assert.equal(parseSavedScroll('abc'), null);
  assert.equal(parseSavedScroll('-5'), null);
});

test('parseSavedScroll parses a non-negative integer', () => {
  assert.equal(parseSavedScroll('0'), 0);
  assert.equal(parseSavedScroll('1234'), 1234);
  assert.equal(parseSavedScroll('1234.7'), 1234);
});
