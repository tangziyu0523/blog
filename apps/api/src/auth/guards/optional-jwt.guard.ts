import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  // Never throw: anonymous requests proceed with user = undefined.
  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
