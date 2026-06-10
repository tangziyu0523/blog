import { Body, Controller, Post, Req, Res, UseGuards, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { TokenService, type TokenPair } from './token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { ACCESS_COOKIE, REFRESH_COOKIE, buildCookieOptions } from './cookies';

interface RefreshUser {
  userId: string;
  tid: string;
  token: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  private setCookies(res: Response, pair: TokenPair): void {
    const domain = this.config.getOrThrow<string>('COOKIE_DOMAIN');
    const secure = this.config.getOrThrow<string>('NODE_ENV') === 'production';
    res.cookie(ACCESS_COOKIE, pair.accessToken, buildCookieOptions('access', domain, secure));
    res.cookie(REFRESH_COOKIE, pair.refreshToken, buildCookieOptions('refresh', domain, secure));
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.register(dto);
    this.setCookies(res, tokens);
    return user;
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(dto);
    this.setCookies(res, tokens);
    return user;
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(JwtRefreshGuard)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { userId, tid, token } = req.user as RefreshUser;
    const pair = await this.tokens.rotate(userId, tid, token);
    this.setCookies(res, pair);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtRefreshGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { userId, tid } = req.user as RefreshUser;
    await this.tokens.revoke(userId, tid);
    const domain = this.config.getOrThrow<string>('COOKIE_DOMAIN');
    const secure = this.config.getOrThrow<string>('NODE_ENV') === 'production';
    res.clearCookie(ACCESS_COOKIE, buildCookieOptions('access', domain, secure));
    res.clearCookie(REFRESH_COOKIE, buildCookieOptions('refresh', domain, secure));
  }
}
