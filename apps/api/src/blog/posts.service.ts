import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugifyTitle, shortSuffix } from './slug';
import { toDetail } from './post.mapper';
import type { PostDetail } from '@blog/shared';

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
    let slug = slugifyTitle(title);
    while (await this.prisma.post.findUnique({ where: { slug } })) {
      slug = `${slugifyTitle(title)}-${shortSuffix()}`;
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
