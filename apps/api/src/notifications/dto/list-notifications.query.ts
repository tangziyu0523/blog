import { IsOptional, IsString } from 'class-validator';

export class ListNotificationsQuery {
  @IsOptional()
  @IsString()
  cursor?: string;
}
