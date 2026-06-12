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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { CommentLikesService } from './comment-likes.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListCommentsQuery } from './dto/list-comments.query';

type Viewer = { userId: string } | undefined;

@Controller()
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly commentLikes: CommentLikesService,
  ) {}

  @Post('posts/:postId/comments')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  create(
    @CurrentUser() user: { userId: string },
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(user.userId, postId, dto);
  }

  @Get('posts/:postId/comments')
  @UseGuards(OptionalJwtGuard)
  list(
    @CurrentUser() user: Viewer,
    @Param('postId') postId: string,
    @Query() q: ListCommentsQuery,
  ) {
    return this.comments.list(postId, user?.userId, q.cursor);
  }

  @Get('comments/:id/replies')
  @UseGuards(OptionalJwtGuard)
  replies(
    @CurrentUser() user: Viewer,
    @Param('id') id: string,
    @Query() q: ListCommentsQuery,
  ) {
    return this.comments.listReplies(id, user?.userId, q.cursor);
  }

  @Patch('comments/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(user.userId, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async remove(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    await this.comments.remove(user.userId, id);
  }

  @Post('comments/:id/like')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  like(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.commentLikes.toggle(user.userId, id);
  }
}
