import { PrismaClient } from '@prisma/client';
import { buildPostTokens } from '../search/post-tokens';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const posts = await prisma.post.findMany({
      select: { id: true, title: true, contentMd: true, tags: true },
    });
    for (const p of posts) {
      const tokens = buildPostTokens({
        title: p.title,
        contentMd: p.contentMd,
        tags: p.tags,
      });
      await prisma.post.update({ where: { id: p.id }, data: tokens });
    }

    console.log(`reindexed ${posts.length} posts`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
