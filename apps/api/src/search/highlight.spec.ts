import { buildHighlight } from './highlight';

describe('buildHighlight', () => {
  it('wraps the first matching query token in <b> within a window', () => {
    const body = '本文讲解数据库索引的性能优化方法，以及缓存策略。';
    const out = buildHighlight(body, ['性能', '优化']);
    expect(out).toContain('<b>性能</b>');
  });
  it('escapes HTML in the source before inserting <b>', () => {
    const out = buildHighlight('see <script> and 性能 here', ['性能']);
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<b>性能</b>');
  });
  it('returns a leading snippet when no token matches', () => {
    const out = buildHighlight('完全无关的一段文字内容用于回退展示', ['不存在']);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain('<b>');
  });
  it('returns empty string for empty body', () => {
    expect(buildHighlight('', ['x'])).toBe('');
  });
});
