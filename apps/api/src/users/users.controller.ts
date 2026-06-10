import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() current: { userId: string }) {
    const user = await this.users.findById(current.userId);
    if (!user) throw new AppError(ErrorCode.TOKEN_INVALID, 401, 'User not found');
    return this.users.toAuthUser(user);
  }

  @Patch()
  async update(@CurrentUser() current: { userId: string }, @Body() dto: UpdateProfileDto) {
    const user = await this.users.updateProfile(current.userId, dto);
    return this.users.toAuthUser(user);
  }

  @Delete('github')
  async unbindGithub(@CurrentUser() current: { userId: string }) {
    const user = await this.users.unbindGithub(current.userId);
    return this.users.toAuthUser(user);
  }
}
