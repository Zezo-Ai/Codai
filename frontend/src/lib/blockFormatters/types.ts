/**
 * Block Formatter Types
 * 
 * Type definitions for the block formatting system.
 */

/**
 * Attributes that can be passed to a block formatter
 */
export interface BlockAttributes {
  format?: string;
  language?: string;
  display?: 'inline' | 'block';
  [key: string]: any;
}

/**
 * Result returned by a block formatter
 */
export interface FormatterResult {
  html: string;
  metadata?: Record<string, any>;
  diagnostics?: {
    partialContent?: boolean;
    needsClosing?: boolean;
    openTags?: string[];
  };
}

/**
 * Interface for block formatters
 */
export interface BlockFormatter {
  /**
   * Format the content according to the block type and attributes
   */
  format(content: string, attributes: BlockAttributes): FormatterResult;
  
  /**
   * Check if this formatter supports the given block type
   */
  supports(blockType: string): boolean;
  
  /**
   * Check if content is incomplete (optional)
   */
  isPartialContent?(content: string): boolean;
  
  /**
   * Combine partial content chunks (optional)
   */
  combineContentChunks?(previousContent: string, newContent: string): string;
}

/**
 * Registry of block formatters
 */
export type FormattersRegistry = {
  [blockType: string]: BlockFormatter;
};