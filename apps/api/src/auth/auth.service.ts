import { Injectable } from '@nestjs/common';
import { ErrorCode, type AuthUser } from '@blog/shared';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { TokenService, type TokenPair } from './token.service';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../common/app-error';

const MAX_FAILS = 5;
const LOCK_WINDOW_SECONDS = 15 * 60;

export interface AuthResult {
  user: AuthUser;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly redis: RedisService,
  ) {}

  async register(dto: { email: string; password: string; nickname: string }): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new AppError(ErrorCode.EMAIL_TAKEN, 409, 'Email already registered');
    }
    const passwordHash = await this.password.hash(dto.password);
    const user = await this.users.createPasswordUser({ email: dto.email, passwordHash, nickname: dto.nickname });
    return { user: this.users.toAuthUser(user), tokens: await this.tokens.issuePair(user.id) };
  }

  async login(dto: { email: string; password: string }): Promise<AuthResult> {
    const failKey = `login_fail:${dto.email}`;
    const fails = Number((await this.redis.get(failKey)) ?? 0);
    if (fails >= MAX_FAILS) {
      const ttl = await this.redis.ttl(failKey);
      throw new AppError(ErrorCode.ACCOUNT_LOCKED, 423, 'Account temporarily locked', {
        'Retry-After': String(ttl > 0 ? ttl : LOCK_WINDOW_SECONDS),
      });
    }

    const user = await this.users.findByEmail(dto.email);
    if (!user || !user.passwordHash || !(await this.password.verify(user.passwordHash, dto.password))) {
      const count = await this.redis.incr(failKey);
      if (count === 1) await this.redis.expire(failKey, LOCK_WINDOW_SECONDS);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, 'Invalid email or password');
    }

    await this.redis.del(failKey);
    return { user: this.users.toAuthUser(user), tokens: await this.tokens.issuePair(user.id) };
  }
}
