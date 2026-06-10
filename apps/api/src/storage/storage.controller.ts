import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from './storage.service';
import { UsersService } from '../users/users.service';
import { ConfirmAvatarDto } from './dto/confirm-avatar.dto';

@Controller('me/avatar')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly users: UsersService,
  ) {}

  @Post('presign')
  presign(@CurrentUser() current: { userId: string }) {
    return this.storage.presign(current.userId);
  }

  @Post('confirm')
  async confirm(
    @CurrentUser() current: { userId: string },
    @Body() dto: ConfirmAvatarDto,
  ) {
    const key = await this.storage.confirm(current.userId, dto.key);
    const user = await this.users.setAvatar(current.userId, key);
    return this.users.toAuthUser(user);
  }
}
