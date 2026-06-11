import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugifyTitle, shortSuffix } from './slug';
import { toDetail } from './post.mapper';
import { AppError } from '../common/app-error';
import { ErrorCode, type PostDetail } from '@blog/shared';

interface CreateInput {
  title: string;
  contentMd: string;
  tags?: string[];
  summary?: string;
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugifyTitle(title);
    let slug = base;
    let attempts = 0;
    while (await this.prisma.post.findUnique({ where: { slug } })) {
      if (++attempts > 5) {
        throw new AppError(
          ErrorCode.SLUG_TAKEN,
          500,
          'Could not generate a unique slug',
        );
      }
      slug = `${base}-${shortSuffix()}`;
    }
    return slug;
  }

  async create(authorId: string, input: CreateInput): Promise<PostDetail> {
    const slug = await this.uniqueSlug(input.title);
    const post = await this.prisma.post.create({
      data: {
        slug,
        title: input.title,
        contentMd: input.contentMd,
        tags: input.tags ?? [],
        summary: input.summary ?? null,
        authorId,
      },
      include: { author: true },
    });
    return toDetail(post, false);
  }
}
