import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '@blog/shared';
import { AppError } from '../../common/app-error';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (user) return user;
    const name = info instanceof Error ? info.name : '';
    throw new AppError(
      name === 'TokenExpiredError' ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID,
      401,
      'Authentication required',
    );
  }
}
