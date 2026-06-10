import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
const ACCESS_MAX_AGE = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function buildCookieOptions(kind: 'access' | 'refresh', domain: string, secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    domain,
    path: kind === 'refresh' ? '/auth/refresh' : '/',
    maxAge: kind === 'refresh' ? REFRESH_MAX_AGE : ACCESS_MAX_AGE,
  };
}
