/**
 * Centralized pattern definitions for content processing
 * This provides a single source of truth for regex patterns used throughout the application
 */

export const PATTERNS = {
  // Action commands - matches JSON objects with action/command/operation/query keys
  // Note: Using a lookahead (?=.*:) to ensure we have a colon after the key name
  ACTION_COMMAND: /(\{(?:"action"|"command"|"operation"|"query")(?=.*:)(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/g,
  
  // Numbered commands - matches numbered items followed by JSON
  NUMBERED_COMMAND: /(\d+\.\s*[^:{]+):(\{[^{]*(?:\{[^}]*\})*[^{]*\})/g,
  
  // Code blocks - matches markdown code blocks with optional language
  CODE_BLOCK: /```(\w+)?\s*([\s\S]*?)```/g,
  
  // Web search results - matches content between search result markers
  WEB_SEARCH: /\[WEB_SEARCH_RESULTS\]([\s\S]*?)\[\/WEB_SEARCH_RESULTS\]/g,
  
  // Timestamps - matches time format HH:MM:SS
  TIMESTAMP: /(\d{2}:\d{2}:\d{2})/g,
  
  // File path - matches common file path patterns
  FILE_PATH: /(?:\/[\w.-]+)+\.\w+|\w:\\(?:[\w.-]+\\)*[\w.-]+\.\w+/,
  
  // URL pattern - matches URLs
  URL: /https?:\/\/[^\s"')]+/g
};

/**
 * Content detector utility for checking if content matches specific patterns
 */
export const contentDetector = {
  /**
   * Checks if content contains action commands
   */
  hasActionCommands: (content: string): boolean => 
    PATTERNS.ACTION_COMMAND.test(content),
  
  /**
   * Checks if content contains code blocks
   */
  hasCodeBlocks: (content: string): boolean => 
    PATTERNS.CODE_BLOCK.test(content),
  
  /**
   * Checks if content contains web search results
   */
  hasWebSearchResults: (content: string): boolean => 
    PATTERNS.WEB_SEARCH.test(content),
  
  /**
   * Checks if content contains timestamps
   */
  hasTimestamps: (content: string): boolean => 
    PATTERNS.TIMESTAMP.test(content),
  
  /**
   * Checks if content is likely a file path
   */
  isFilePath: (content: string): boolean =>
    PATTERNS.FILE_PATH.test(content),
  
  /**
   * Extracts all matches for a given pattern
   */
  extractAll: (content: string, pattern: RegExp): RegExpMatchArray[] => {
    const matches = Array.from(content.matchAll(pattern));
    return matches;
  },
  
  /**
   * Splits content into text and pattern matches
   */
  splitByPattern: (content: string, pattern: RegExp): Array<{
    type: 'match' | 'text',
    content: string,
    index?: number,
    match?: RegExpMatchArray
  }> => {
    const parts = [];
    const matches = Array.from(content.matchAll(pattern));
    let lastIndex = 0;
    
    matches.forEach((match, index) => {
      if (match.index && match.index > lastIndex) {
        // Add text before match
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        });
      }
      
      // Add match
      parts.push({
        type: 'match',
        content: match[0],
        index,
        match
      });
      
      lastIndex = match.index ? match.index + match[0].length : 0;
    });
    
    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      });
    }
    
    return parts;
  }
};

/**
 * Formats file content by replacing escaped newlines and preserving indentation
 */
export const formatFileContent = (content: string): string => {
  return content.replace(/\\n/g, '\n');
};