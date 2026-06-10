import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { ErrorCode } from '@blog/shared';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../common/app-error';

const ACCESS_TTL = '15m';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
}

interface RefreshPayload {
  sub: string;
  tid: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private key(userId: string, tid: string): string {
    return `refresh:${userId}:${tid}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issuePair(userId: string): Promise<TokenPair> {
    const tid = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: ACCESS_TTL },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tid },
      { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: REFRESH_TTL_SECONDS },
    );
    await this.redis.set(this.key(userId, tid), this.hashToken(refreshToken), 'EX', REFRESH_TTL_SECONDS);
    return { accessToken, refreshToken, refreshTokenId: tid };
  }

  async verifyRefresh(token: string): Promise<RefreshPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch (err) {
      const expired = err instanceof Error && err.name === 'TokenExpiredError';
      throw new AppError(
        expired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID,
        401,
        expired ? 'Refresh token expired' : 'Invalid refresh token',
      );
    }
  }

  async rotate(userId: string, tid: string, presentedToken: string): Promise<TokenPair> {
    const stored = await this.redis.get(this.key(userId, tid));
    if (stored === null || stored !== this.hashToken(presentedToken)) {
      await this.revokeAll(userId);
      throw new AppError(ErrorCode.REFRESH_REUSE_DETECTED, 401, 'Refresh token reuse detected; all sessions revoked');
    }
    await this.redis.del(this.key(userId, tid));
    return this.issuePair(userId);
  }

  async revoke(userId: string, tid: string): Promise<void> {
    await this.redis.del(this.key(userId, tid));
  }

  async revokeAll(userId: string): Promise<void> {
    const keys = await this.redis.keys(`refresh:${userId}:*`);
    if (keys.length > 0) await this.redis.del(...keys);
  }
}
