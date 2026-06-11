-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "bodyTokens" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tagsTokens" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "titleTokens" TEXT NOT NULL DEFAULT '';

-- Enable trigram matching for typo/prefix fallback on titles
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Weighted search vector derived from the app-tokenized columns:
-- title (A) > tags (B) > body (C). 'simple' config: tokens are pre-segmented.
ALTER TABLE "Post" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("titleTokens", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("tagsTokens",  '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("bodyTokens",  '')), 'C')
  ) STORED;

CREATE INDEX "post_search_vector_idx" ON "Post" USING GIN (search_vector);
CREATE INDEX "post_title_trgm_idx" ON "Post" USING GIN ("title" gin_trgm_ops);
