import { IsOptional, IsString } from 'class-validator';

export class ListCommentsQuery {
  @IsOptional()
  @IsString()
  cursor?: string;
}
