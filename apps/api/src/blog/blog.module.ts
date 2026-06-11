import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsService } from './posts.service';
import { LikesService } from './likes.service';
import { PostsController } from './posts.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PostsController],
  providers: [PostsService, LikesService],
})
export class BlogModule {}
