import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ErrorCode, type AuthUser } from '@blog/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByGithubId(githubId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { githubId } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createPasswordUser(data: {
    email: string;
    passwordHash: string;
    nickname: string;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  createGithubUser(data: {
    email: string;
    nickname: string;
    githubId: string;
    githubLogin: string;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  updateProfile(
    id: string,
    data: { nickname?: string; bio?: string },
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  setAvatar(id: string, avatarUrl: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { avatarUrl } });
  }

  async bindGithub(
    userId: string,
    githubId: string,
    githubLogin: string,
  ): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { githubId } });
    if (existing && existing.id !== userId) {
      throw new AppError(
        ErrorCode.GITHUB_ALREADY_BOUND,
        409,
        'This GitHub account is already linked to another user',
      );
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { githubId, githubLogin },
    });
  }

  async unbindGithub(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user && user.passwordHash === null) {
      throw new AppError(
        ErrorCode.CANNOT_UNBIND_LAST_METHOD,
        409,
        'Set a password before unlinking GitHub',
      );
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { githubId: null, githubLogin: null },
    });
  }

  toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      githubLogin: user.githubLogin,
    };
  }
}
