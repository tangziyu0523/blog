import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  imports: [UsersModule],
  providers: [StorageService],
  controllers: [StorageController],
})
export class StorageModule {}
