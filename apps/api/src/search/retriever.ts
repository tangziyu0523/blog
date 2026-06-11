export interface RankedHit {
  postId: string;
  score: number;
}

export interface Retriever {
  readonly name: string;
  retrieve(query: string, limit: number): Promise<RankedHit[]>;
}
