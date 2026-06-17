import { buildCookieOptions, ACCESS_COOKIE, REFRESH_COOKIE } from './cookies';

describe('cookies', () => {
  it('access cookie is httpOnly with root path and lax in dev', () => {
    const opts = buildCookieOptions('access', 'example.com', false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.domain).toBe('example.com');
  });

  it('refresh cookie path is scoped to the /auth namespace', () => {
    const opts = buildCookieOptions('refresh', 'example.com', false);
    expect(opts.path).toBe('/auth');
  });

  it('secure=true (production) sets sameSite to none for cross-site XHR', () => {
    const opts = buildCookieOptions('access', 'example.com', true);
    expect(opts.secure).toBe(true);
    expect(opts.sameSite).toBe('none');
  });

  it('host-only cookie: omits domain attribute when domain is undefined', () => {
    const opts = buildCookieOptions('access', undefined, true);
    expect(opts.domain).toBeUndefined();
    expect(opts.sameSite).toBe('none');
  });

  it('cookie names are stable', () => {
    expect(ACCESS_COOKIE).toBe('access_token');
    expect(REFRESH_COOKIE).toBe('refresh_token');
  });
});
