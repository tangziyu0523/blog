import { IsString, Matches } from 'class-validator';

export class ConfirmImageDto {
  @IsString()
  @Matches(/^images\/[^/]+\/[^/]+\.webp$/)
  key!: string;
}
