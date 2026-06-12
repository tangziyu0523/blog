import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FollowsService } from './follows.service';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService } from './notification-stream.service';
import { FollowsController } from './follows.controller';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule],
  controllers: [FollowsController, NotificationsController],
  providers: [FollowsService, NotificationsService, NotificationStreamService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
