import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
const ACCESS_MAX_AGE = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function buildCookieOptions(
  kind: 'access' | 'refresh',
  domain: string | undefined,
  secure: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure,
    // Prod is cross-site (web on Vercel, api on Railway = different sites):
    // SameSite=None+Secure lets the cookie ride cross-site XHR. Dev/test
    // (secure=false) stays SameSite=Lax (same-site localhost).
    sameSite: secure ? 'none' : 'lax',
    ...(domain ? { domain } : {}),
    // Refresh cookie is scoped to the /auth namespace (not just /auth/refresh)
    // so it is also sent to POST /auth/logout, which must revoke the session.
    // It still never reaches application routes like /me or content APIs.
    path: kind === 'refresh' ? '/auth' : '/',
    maxAge: kind === 'refresh' ? REFRESH_MAX_AGE : ACCESS_MAX_AGE,
  };
}
