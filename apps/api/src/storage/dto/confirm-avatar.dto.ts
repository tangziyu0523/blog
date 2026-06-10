import { IsString, Matches } from 'class-validator';

export class ConfirmAvatarDto {
  @IsString()
  @Matches(/^avatars\/[^/]+\/[^/]+\.webp$/)
  key!: string;
}
