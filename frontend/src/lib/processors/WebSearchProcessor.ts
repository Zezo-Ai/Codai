import { ContentProcessor } from './ContentProcessor';
import { PATTERNS } from '../patterns';

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
  otherQueries?: string[];
}

export type WebSearchSegment = {
  type: 'search' | 'text';
  content: string;
  metadata?: WebSearchMetadata;
};

/**
 * Processor for handling web search results in content
 */
export class WebSearchProcessor extends ContentProcessor<WebSearchSegment[]> {
  /**
   * Check if this processor can handle the provided content
   * @param content The content to check
   * @returns True if content contains web search results
   */
  canProcess(content: string): boolean {
    return PATTERNS.WEB_SEARCH.test(content);
  }
  
  /**
   * Process the content and extract web search results
   * @param content The content to process
   * @returns Array of text and web search segments
   */
  process(content: string): WebSearchSegment[] {
    if (this.isEmpty(content)) {
      return [{
        type: 'text',
        content: ''
      }];
    }
    
    const cleanedContent = this.cleanContent(content);
    const segments: WebSearchSegment[] = [];
    
    // Use the splitByPattern utility to separate search results from regular text
    const parts = this.splitContent(cleanedContent);
    
    for (const part of parts) {
      if (part.type === 'search') {
        // Extract metadata from search content
        const metadata = this.extractSearchMetadata(part.content);
        
        segments.push({
          type: 'search',
          content: part.content,
          metadata
        });
      } else if (part.content.trim()) {
        segments.push({
          type: 'text',
          content: part.content.trim()
        });
      }
    }
    
    return segments;
  }
  
  /**
   * Split content into search results and regular text
   * @param content Content to split
   * @returns Array of content segments
   */
  private splitContent(content: string): Array<{ type: 'search' | 'text', content: string }> {
    const parts: Array<{ type: 'search' | 'text', content: string }> = [];
    let lastIndex = 0;
    
    // Reset the regex before using it
    PATTERNS.WEB_SEARCH.lastIndex = 0;
    
    let match;
    while ((match = PATTERNS.WEB_SEARCH.exec(content)) !== null) {
      // Add text before search result if it exists
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({
            type: 'text',
            content: textBefore
          });
        }
      }
      
      // Add search result
      parts.push({
        type: 'search',
        content: match[0]
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text if it exists
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex).trim();
      if (remainingText) {
        parts.push({
          type: 'text',
          content: remainingText
        });
      }
    }
    
    return parts;
  }
  
  /**
   * Extract metadata from search content
   * @param content Search content to analyze
   * @returns Extracted search metadata
   */
  private extractSearchMetadata(content: string): WebSearchMetadata {
    try {
      // Extract the content between [WEB_SEARCH_RESULTS] and [/WEB_SEARCH_RESULTS]
      const regex = /\[WEB_SEARCH_RESULTS\]([\s\S]*?)\[\/WEB_SEARCH_RESULTS\]/;
      const match = content.match(regex);
      
      if (!match || !match[1]) {
        return this.createEmptyMetadata();
      }
      
      const searchContent = match[1].trim();
      
      // Check if this is an error message
      const isErrorResult = searchContent.includes("Search encountered an error");
      
      // Extract query from the first line
      const queryMatch = searchContent.match(/Search results for ['"]([^'"]+)['"] from ([^:]+):/);
      if (!queryMatch && !isErrorResult) {
        return this.createEmptyMetadata();
      }
      
      const query = queryMatch ? queryMatch[1] : "Unknown search";
      const engine = queryMatch ? queryMatch[2] : "Search Engine";
      
      // Handle error cases first
      if (isErrorResult) {
        const errorMatch = searchContent.match(/Search encountered an error: ([^\n]+)/);
        const errorMessage = errorMatch ? errorMatch[1] : "Unknown search error";
        
        return {
          query,
          engine,
          num_results: 0,
          results: [],
          errors: [errorMessage]
        };
      }
      
      // Extract results - first find where the numbered results start
      const results: WebSearchResult[] = [];
      const resultBlocks = this.extractResultBlocks(searchContent);
      
      for (const block of resultBlocks) {
        const result = this.parseResultBlock(block);
        if (result) {
          results.push(result);
        }
      }
      
      return {
        query,
        engine,
        num_results: results.length,
        results
      };
    } catch (error) {
      console.error('Error extracting search metadata:', error);
      return this.createEmptyMetadata();
    }
  }
  
  /**
   * Extract individual result blocks from search content
   * @param searchContent Search content to parse
   * @returns Array of result block strings
   */
  private extractResultBlocks(searchContent: string): string[] {
    // Find where the numbered results start - after the intro line
    const firstResultIndex = searchContent.indexOf('1.');
    if (firstResultIndex === -1) return [];
    
    // Extract just the results section
    const resultsSection = searchContent.substring(firstResultIndex);
    
    // Split by numbered items
    const resultBlocks = resultsSection.split(/\s*\d+\.\s+/).filter(block => block.trim());
    
    return resultBlocks;
  }
  
  /**
   * Parse a result block into a structured result object
   * @param block Result block text
   * @returns Parsed result or null if invalid
   */
  private parseResultBlock(block: string): WebSearchResult | null {
    try {
      // Find the URL line
      const urlIndex = block.indexOf("URL:");
      if (urlIndex === -1) return null;
      
      // Split content and URL
      const content = block.substring(0, urlIndex).trim();
      const urlLine = block.substring(urlIndex).trim();
      const url = urlLine.replace(/^URL:\s*/, "").trim();
      
      // Get title from the first line of content
      const title = content.split('\n')[0].trim();
      
      if (!title || !url) return null;
      
      return {
        title,
        content,
        url
      };
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Create empty metadata for invalid search results
   * @returns Basic metadata structure
   */
  private createEmptyMetadata(): WebSearchMetadata {
    return {
      query: '',
      engine: 'Unknown',
      num_results: 0,
      results: []
    };
  }
}