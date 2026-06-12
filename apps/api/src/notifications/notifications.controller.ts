import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import {
  NotificationStreamService,
  type SseMessage,
} from './notification-stream.service';
import { ListNotificationsQuery } from './dto/list-notifications.query';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly streamSvc: NotificationStreamService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: { userId: string },
    @Query() q: ListNotificationsQuery,
  ) {
    return this.notifications.list(user.userId, q.cursor);
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  async unreadCount(@CurrentUser() user: { userId: string }) {
    return { count: await this.notifications.unreadCount(user.userId) };
  }

  @Post(':id/read')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async markRead(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    await this.notifications.markRead(user.userId, id);
  }

  @Post('read-all')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async markAllRead(@CurrentUser() user: { userId: string }) {
    await this.notifications.markAllRead(user.userId);
  }

  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  stream(@CurrentUser() user: { userId: string }): Observable<SseMessage> {
    return this.streamSvc.connect(user.userId);
  }
}
