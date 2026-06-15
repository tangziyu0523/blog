import { Type } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListPostsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsBooleanString()
  mine?: string; // '1' / 'true'

  @IsOptional()
  @IsIn(['latest', 'hot'])
  sort?: 'latest' | 'hot';
}
