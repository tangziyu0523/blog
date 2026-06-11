import { buildPostTokens } from './post-tokens';

describe('buildPostTokens', () => {
  it('produces tokenized title, body (md-stripped) and tags', () => {
    const out = buildPostTokens({
      title: '性能优化',
      contentMd: '# 标题\n\n讲解缓存策略 `code`',
      tags: ['数据库', 'redis'],
    });
    expect(out.titleTokens).toContain('性能');
    expect(out.bodyTokens).toContain('缓存');
    expect(out.bodyTokens).not.toContain('code'); // inline code stripped
    expect(out.tagsTokens).toContain('redis');
  });
  it('handles empty tags', () => {
    const out = buildPostTokens({ title: 'x', contentMd: 'y', tags: [] });
    expect(out.tagsTokens).toBe('');
  });
});
