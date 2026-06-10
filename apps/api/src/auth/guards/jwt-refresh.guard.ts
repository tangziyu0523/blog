import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '@blog/shared';
import { AppError } from '../../common/app-error';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (user) return user;
    const name = info instanceof Error ? info.name : '';
    if (name === 'TokenExpiredError') {
      throw new AppError(ErrorCode.TOKEN_EXPIRED, 401, 'Refresh token expired');
    }
    throw new AppError(ErrorCode.TOKEN_INVALID, 401, 'Invalid refresh token');
  }
}
