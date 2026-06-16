import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderInline, renderProse } from './markdown.ts';

test('escapeHtml escapes the HTML specials', () => {
  assert.equal(escapeHtml('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
});

test('renderInline handles bold, italic, and inline code', () => {
  assert.equal(renderInline('a **b** c'), 'a <strong>b</strong> c');
  assert.equal(renderInline('a _b_ c'), 'a <em>b</em> c');
  assert.equal(renderInline('a `b` c'), 'a <code>b</code> c');
});

test('renderInline does not format inside inline code', () => {
  assert.equal(renderInline('`a *b* c`'), '<code>a *b* c</code>');
});

test('renderInline leaves digit-spaced text untouched (sentinel safety)', () => {
  assert.equal(renderInline('done in 5 minutes'), 'done in 5 minutes');
});

test('renderInline renders safe links and rejects unsafe schemes', () => {
  assert.equal(
    renderInline('[x](https://e.com)'),
    '<a href="https://e.com" rel="noopener noreferrer">x</a>',
  );
  assert.equal(renderInline('[x](/p)'), '<a href="/p" rel="noopener noreferrer">x</a>');
  assert.equal(renderInline('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
});

test('renderProse renders headings h1..h3', () => {
  assert.equal(renderProse('# A'), '<h1>A</h1>');
  assert.equal(renderProse('## B'), '<h2>B</h2>');
  assert.equal(renderProse('### C'), '<h3>C</h3>');
});

test('renderProse groups an unordered list', () => {
  assert.equal(renderProse('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
});

test('renderProse groups an ordered list', () => {
  assert.equal(renderProse('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
});

test('renderProse renders a blockquote', () => {
  assert.equal(renderProse('> hi'), '<blockquote>hi</blockquote>');
});

test('renderProse wraps a paragraph and applies inline + escaping', () => {
  assert.equal(renderProse('a **b** <x>'), '<p>a <strong>b</strong> &lt;x&gt;</p>');
});

test('renderProse separates paragraphs on blank lines', () => {
  assert.equal(renderProse('a\n\nb'), '<p>a</p><p>b</p>');
});

test('renderInline renders a safe image and rejects unsafe src', () => {
  assert.equal(
    renderInline('![cat](http://localhost:9000/blog/images/u/x.webp)'),
    '<img src="http://localhost:9000/blog/images/u/x.webp" alt="cat" loading="lazy">',
  );
  assert.equal(
    renderInline('![x](javascript:alert(1))'),
    '![x](javascript:alert(1))',
  );
});

test('renderInline escapes the image alt text', () => {
  assert.equal(
    renderInline('![a<b>](https://e.com/i.webp)'),
    '<img src="https://e.com/i.webp" alt="a&lt;b&gt;" loading="lazy">',
  );
});

test('renderInline does not confuse an image with a link', () => {
  assert.equal(
    renderInline('see ![pic](https://e.com/i.webp) here'),
    'see <img src="https://e.com/i.webp" alt="pic" loading="lazy"> here',
  );
});

test('renderProse wraps a stand-alone image line in a figure block', () => {
  assert.equal(
    renderProse('![cat](https://e.com/c.webp)'),
    '<figure class="post-image"><img src="https://e.com/c.webp" alt="cat" loading="lazy"></figure>',
  );
});

test('renderProse keeps text paragraphs separate from an image block', () => {
  assert.equal(
    renderProse('hello\n\n![c](https://e.com/c.webp)\n\nworld'),
    '<p>hello</p><figure class="post-image"><img src="https://e.com/c.webp" alt="c" loading="lazy"></figure><p>world</p>',
  );
});

test('renderInline neutralizes a double-quote in image alt (no attribute injection)', () => {
  assert.equal(
    renderInline('![x" onerror="alert(1)](https://e.com/i.webp)'),
    '<img src="https://e.com/i.webp" alt="x&quot; onerror=&quot;alert(1)" loading="lazy">',
  );
});

test('renderProse neutralizes a double-quote in a figure image alt', () => {
  assert.equal(
    renderProse('![a"b](https://e.com/i.webp)'),
    '<figure class="post-image"><img src="https://e.com/i.webp" alt="a&quot;b" loading="lazy">' +
      '</figure>',
  );
});
