import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQuery } from './dto/search.query';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@Query() q: SearchQuery) {
    return this.search.search(q.q.trim(), q.page ?? 1, q.pageSize ?? 10);
  }
}
