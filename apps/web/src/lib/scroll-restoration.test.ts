import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_SCROLL_KEY, parseSavedScroll, decideHomeScroll } from './scroll-restoration.ts';

test('HOME_SCROLL_KEY is a stable string', () => {
  assert.equal(typeof HOME_SCROLL_KEY, 'string');
  assert.ok(HOME_SCROLL_KEY.length > 0);
});

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

test('decideHomeScroll restores saved position on pop navigation', () => {
  assert.equal(decideHomeScroll('pop', 800), 800);
  assert.equal(decideHomeScroll('pop', 0), 0);
});

test('decideHomeScroll goes to top on push navigation', () => {
  assert.equal(decideHomeScroll('push', 800), 0);
});

test('decideHomeScroll goes to top on pop when nothing was saved', () => {
  assert.equal(decideHomeScroll('pop', null), 0);
});
