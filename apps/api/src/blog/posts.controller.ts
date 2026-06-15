import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PostsService } from './posts.service';
import { LikesService } from './likes.service';
import { ViewCountService } from './view-count.service';
import { viewerKeyFor } from './viewer-key';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQuery } from './dto/list-posts.query';

type Viewer = { userId: string } | undefined;

@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly likes: LikesService,
    private readonly views: ViewCountService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreatePostDto) {
    return this.posts.create(user.userId, dto);
  }

  @Get()
  @UseGuards(OptionalJwtGuard)
  list(@CurrentUser() user: Viewer, @Query() q: ListPostsQuery) {
    // `?mine` without a valid session degrades silently to the public list:
    // PostsService.list ignores `mine` when userId is undefined.
    const mine = q.mine === '1' || q.mine === 'true';
    return this.posts.list({
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 10,
      mine,
      userId: user?.userId,
      sort: q.sort ?? 'latest',
    });
  }

  @Post(':id/view')
  @HttpCode(204)
  @UseGuards(OptionalJwtGuard)
  async view(
    @CurrentUser() user: Viewer,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    const key = viewerKeyFor(user?.userId, req.ip, req.headers['user-agent']);
    await this.views.record(id, key);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtGuard)
  getBySlug(@CurrentUser() user: Viewer, @Param('slug') slug: string) {
    return this.posts.getBySlug(slug, user?.userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update(id, user.userId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async remove(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    await this.posts.remove(id, user.userId);
  }

  @Post(':id/like')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  like(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.likes.toggle(user.userId, id);
  }
}
