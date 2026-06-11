import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { FtsRetriever } from './fts.retriever';

@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [SearchService, FtsRetriever],
})
export class SearchModule {}
