import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://blog:blog@localhost:5432/blog',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    GITHUB_CLIENT_ID: 'id',
    GITHUB_CLIENT_SECRET: 'secret',
    GITHUB_CALLBACK_URL: 'http://localhost:3001/auth/github/callback',
    WEB_ORIGIN: 'http://localhost:3000',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_BUCKET: 'blog',
    COOKIE_DOMAIN: 'localhost',
  };

  it('passes with a valid env', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('throws when a required var is missing', () => {
    const { JWT_ACCESS_SECRET, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('throws when JWT secret is too short', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow();
  });
});
