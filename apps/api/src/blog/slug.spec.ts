import { slugifyTitle } from './slug';

describe('slugifyTitle', () => {
  it('slugifies ascii titles', () => {
    expect(slugifyTitle('Hello, World! 2026')).toBe('hello-world-2026');
  });
  it('falls back for non-ascii (Chinese) titles', () => {
    expect(slugifyTitle('系统编程')).toMatch(/^post-[0-9a-f]{8}$/);
  });
});
