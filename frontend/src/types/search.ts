export interface WebSearchResult {
  title: string;
  content: string;
  url: string;
}

export interface WebSearchMetadata {
  query: string;
  engine: string;
  num_results: number;
  results: WebSearchResult[];
  errors?: string[];
  hasMultipleSearches?: boolean;
  otherQueries?: string[]; // Queries from additional search blocks
}