import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideHomeMode } from './home-mode.ts';

test('explicit list intent → list mode', () => {
  assert.equal(decideHomeMode('push', true), 'list');
  assert.equal(decideHomeMode('pop', true), 'list');
});

test('back/forward (pop) → list mode', () => {
  assert.equal(decideHomeMode('pop', false), 'list');
});

test('fresh load / logo (push, no intent) → intro mode', () => {
  assert.equal(decideHomeMode('push', false), 'intro');
});
