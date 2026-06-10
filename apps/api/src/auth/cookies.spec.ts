import { buildCookieOptions, ACCESS_COOKIE, REFRESH_COOKIE } from './cookies';

describe('cookies', () => {
  it('access cookie is httpOnly with root path', () => {
    const opts = buildCookieOptions('access', 'example.com', false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
  });

  it('refresh cookie path is scoped to the /auth namespace', () => {
    const opts = buildCookieOptions('refresh', 'example.com', false);
    expect(opts.path).toBe('/auth');
  });

  it('secure is true in production', () => {
    expect(buildCookieOptions('access', 'example.com', true).secure).toBe(true);
  });

  it('cookie names are stable', () => {
    expect(ACCESS_COOKIE).toBe('access_token');
    expect(REFRESH_COOKIE).toBe('refresh_token');
  });
});
