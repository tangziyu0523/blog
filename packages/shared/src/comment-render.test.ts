import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCommentMarkdown } from './comment-render.ts';

test('escapes script tags', () => {
  const out = renderCommentMarkdown('<script>alert(1)</script>');
  assert.ok(!out.includes('<script'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('neutralizes img onerror by escaping the tag', () => {
  const out = renderCommentMarkdown('<img src=x onerror=alert(1)>');
  // The security boundary is escaping: no real <img> tag reaches the DOM.
  // The literal "onerror=" surviving inside escaped text is inert.
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('javascript: link is NOT turned into an anchor', () => {
  const out = renderCommentMarkdown('[x](javascript:alert(1))');
  assert.ok(!out.includes('<a '));
  assert.ok(out.includes('[x]'));
});

test('http link becomes safe anchor', () => {
  const out = renderCommentMarkdown('[home](https://e.com/a)');
  assert.equal(
    out,
    '<a href="https://e.com/a" target="_blank" rel="noopener noreferrer nofollow">home</a>',
  );
});

test('bold and inline code render', () => {
  assert.equal(renderCommentMarkdown('**b**'), '<strong>b</strong>');
  assert.equal(renderCommentMarkdown('`<b>`'), '<code>&lt;b&gt;</code>');
});

test('newlines become <br>', () => {
  assert.equal(renderCommentMarkdown('a\nb'), 'a<br>b');
});
