import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, type Profile, type StrategyOptions } from 'passport-github2';
import type { GithubProfile } from '../auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('GITHUB_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GITHUB_CALLBACK_URL'),
      scope: ['user:email'],
    } satisfies StrategyOptions);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): GithubProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('GitHub account has no accessible email');
    }
    return {
      githubId: profile.id,
      githubLogin: profile.username ?? profile.id,
      email,
    };
  }
}
