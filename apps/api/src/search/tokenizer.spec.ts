import { tokenize, stripMarkdown } from './tokenizer';

describe('stripMarkdown', () => {
  it('removes fenced code, inline code, link/image syntax and markers', () => {
    const md =
      '# 标题\n\n```ts\nconst x = 1;\n```\n看[链接](http://a.com)和 `code` **粗**';
    const out = stripMarkdown(md);
    expect(out).not.toContain('```');
    expect(out).not.toContain('const x = 1;');
    expect(out).not.toContain('http://a.com');
    expect(out).not.toContain('`');
    expect(out).not.toContain('#');
    expect(out).not.toContain('*');
    expect(out).toContain('标题');
    expect(out).toContain('链接');
    expect(out).toContain('粗');
  });
});

describe('tokenize', () => {
  it('segments Chinese into space-joined lowercased tokens', () => {
    const out = tokenize('性能优化指南');
    expect(out.split(' ')).toEqual(expect.arrayContaining(['性能', '优化']));
  });
  it('handles mixed CJK + English and lowercases', () => {
    const out = tokenize('Redis 缓存 Performance');
    const toks = out.split(' ');
    expect(toks).toContain('redis');
    expect(toks).toContain('缓存');
    expect(toks).toContain('performance');
  });
  it('returns empty string for empty / whitespace / punctuation-only input', () => {
    expect(tokenize('')).toBe('');
    expect(tokenize('   ')).toBe('');
    expect(tokenize('，。！')).toBe('');
  });
});
