import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from './storage.service';
import { ConfirmImageDto } from './dto/confirm-image.dto';

@Controller('me/images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly storage: StorageService) {}

  @Post('presign')
  presign(@CurrentUser() current: { userId: string }) {
    return this.storage.presignImage(current.userId);
  }

  @Post('confirm')
  async confirm(
    @CurrentUser() current: { userId: string },
    @Body() dto: ConfirmImageDto,
  ) {
    const key = await this.storage.confirmImage(current.userId, dto.key);
    return { key };
  }
}
