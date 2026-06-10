import { Body, Controller, Delete, Get, Post, Query, Req, Res, UseGuards, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TokenService, type TokenPair } from './token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { ACCESS_COOKIE, REFRESH_COOKIE, buildCookieOptions } from './cookies';
import { RedisService } from '../redis/redis.service';

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
    private readonly redis: RedisService,
  ) {}

  private setCookies(res: Response, pair: TokenPair): void {
    const domain = this.config.getOrThrow<string>('COOKIE_DOMAIN');
    const secure = this.config.getOrThrow<string>('NODE_ENV') === 'production';
    res.cookie(ACCESS_COOKIE, pair.accessToken, buildCookieOptions('access', domain, secure));
    res.cookie(REFRESH_COOKIE, pair.refreshToken, buildCookieOptions('refresh', domain, secure));
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.register(dto);
    this.setCookies(res, tokens);
    return user;
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
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

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('github')
  async githubStart(@Res() res: Response, @Query('redirect') redirect?: string): Promise<void> {
    const state = randomUUID();
    await this.redis.set(`oauth_state:${state}`, redirect ?? '/', 'EX', 600);
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('GITHUB_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow<string>('GITHUB_CALLBACK_URL'),
      scope: 'user:email',
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('state') state?: string,
  ): Promise<void> {
    const web = this.config.getOrThrow<string>('WEB_ORIGIN');
    const stored = state ? await this.redis.get(`oauth_state:${state}`) : null;
    if (!stored) {
      res.redirect(`${web}/login?error=TOKEN_INVALID`);
      return;
    }
    await this.redis.del(`oauth_state:${state}`);
    interface GithubUser {
      githubId: string;
      githubLogin: string;
      email: string;
    }
    const profile = req.user as GithubUser;
    const outcome = await this.auth.handleGithubLogin(profile);
    if (outcome.kind === 'bind_required') {
      res.redirect(`${web}/login?error=EMAIL_TAKEN_BIND_REQUIRED`);
      return;
    }
    this.setCookies(res, outcome.result.tokens);
    res.redirect(`${web}/`);
  }
}
