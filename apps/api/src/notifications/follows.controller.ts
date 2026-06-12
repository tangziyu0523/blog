import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FollowsService } from './follows.service';

type Viewer = { userId: string } | undefined;

@Controller('users')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post(':id/follow')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  toggle(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.follows.toggle(user.userId, id);
  }

  @Get(':id/follow')
  @UseGuards(OptionalJwtGuard)
  status(@CurrentUser() user: Viewer, @Param('id') id: string) {
    return this.follows.status(user?.userId, id);
  }
}
