import { tokenize, stripMarkdown } from './tokenizer';

export interface PostTokens {
  titleTokens: string;
  bodyTokens: string;
  tagsTokens: string;
}

export function buildPostTokens(input: {
  title: string;
  contentMd: string;
  tags: string[];
}): PostTokens {
  return {
    titleTokens: tokenize(input.title),
    bodyTokens: tokenize(stripMarkdown(input.contentMd)),
    tagsTokens: tokenize(input.tags.join(' ')),
  };
}
