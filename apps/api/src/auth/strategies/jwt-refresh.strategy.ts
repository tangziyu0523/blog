import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, type StrategyOptionsWithRequest } from 'passport-jwt';
import type { Request } from 'express';
import { REFRESH_COOKIE } from '../cookies';

interface RefreshPayload {
  sub: string;
  tid: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    const opts: StrategyOptionsWithRequest = {
      jwtFromRequest: (req: Request): string | null =>
        (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? null,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      ignoreExpiration: false,
      passReqToCallback: true,
    };
    super(opts);
  }

  validate(
    req: Request,
    payload: RefreshPayload,
  ): { userId: string; tid: string; token: string } {
    const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? '';
    return { userId: payload.sub, tid: payload.tid, token };
  }
}
