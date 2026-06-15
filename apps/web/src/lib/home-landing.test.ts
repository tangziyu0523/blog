import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_INTRO_EVENT,
  LIST_OFFSET_KEY,
  SCROLL_TO_INDEX_EVENT,
} from './home-landing.ts';

test('keys/event names are stable non-empty strings', () => {
  assert.ok(LIST_OFFSET_KEY.length > 0);
  assert.ok(SCROLL_TO_INDEX_EVENT.length > 0);
  assert.ok(HOME_INTRO_EVENT.length > 0);
});
