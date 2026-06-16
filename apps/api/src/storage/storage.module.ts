import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { ImagesController } from './images.controller';

@Module({
  imports: [UsersModule],
  providers: [StorageService],
  controllers: [StorageController, ImagesController],
})
export class StorageModule {}
