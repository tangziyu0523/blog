import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_OFFSET_KEY, SCROLL_TO_INDEX_EVENT, decideHomeLanding } from './home-landing.ts';

test('keys/event names are stable non-empty strings', () => {
  assert.ok(LIST_OFFSET_KEY.length > 0);
  assert.ok(SCROLL_TO_INDEX_EVENT.length > 0);
});

test('explicit index intent always lands at list top', () => {
  assert.deepEqual(decideHomeLanding('push', true, null), { mode: 'index', offset: 0 });
  assert.deepEqual(decideHomeLanding('pop', true, 900), { mode: 'index', offset: 0 });
});

test('pop with a saved offset restores into the list', () => {
  assert.deepEqual(decideHomeLanding('pop', false, 900), { mode: 'index', offset: 900 });
  assert.deepEqual(decideHomeLanding('pop', false, 0), { mode: 'index', offset: 0 });
});

test('pop without a saved offset goes to intro top', () => {
  assert.deepEqual(decideHomeLanding('pop', false, null), { mode: 'top' });
});

test('plain push goes to intro top', () => {
  assert.deepEqual(decideHomeLanding('push', false, 900), { mode: 'top' });
});
