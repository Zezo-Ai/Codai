/**
 * Block Formatters Index
 * 
 * Exports all block formatters and provides a registry for accessing them.
 */

import { BlockFormatter, FormattersRegistry, BlockAttributes, FormatterResult } from './types';
import textFormatter from './textFormatter';

/**
 * Registry of available block formatters
 */
const formatters: FormattersRegistry = {
  text: textFormatter,
  // More formatters will be added here
};

/**
 * Get a formatter for a specific block type
 * 
 * @param blockType The type of block to format
 * @returns The formatter for that block type, or null if not found
 */
export function getFormatter(blockType: string): BlockFormatter | null {
  // Direct match
  if (formatters[blockType]) {
    return formatters[blockType];
  }
  
  // Normalize and try again
  const normalizedType = blockType.toLowerCase();
  if (formatters[normalizedType]) {
    return formatters[normalizedType];
  }
  
  // Try to find a formatter that supports this block type
  for (const formatter of Object.values(formatters)) {
    if (formatter.supports(blockType)) {
      return formatter;
    }
  }
  
  // No formatter found
  return null;
}

/**
 * Format a block's content
 * 
 * @param blockType The type of block
 * @param content The block content
 * @param attributes Optional block attributes
 * @returns Formatted HTML result or null if no formatter found
 */
export function formatBlock(
  blockType: string, 
  content: string, 
  attributes: BlockAttributes = {}
): FormatterResult | null {
  console.log(`🔍 FORMATTERS: Looking for formatter for block type "${blockType}"`);
  const formatter = getFormatter(blockType);
  
  if (!formatter) {
    console.log(`❌ FORMATTERS: No formatter found for "${blockType}"`);
    return null;
  }
  
  console.log(`✓ FORMATTERS: Found formatter for "${blockType}", formatting now...`);
  const result = formatter.format(content, attributes);
  console.log(`✅ FORMATTERS: Formatting complete for "${blockType}" [html_length=${result.html.length}]`);
  return result;
}

/**
 * Check if content is partial/incomplete
 * 
 * @param blockType The type of block
 * @param content The content to check
 * @returns Whether the content appears to be incomplete
 */
export function isPartialContent(blockType: string, content: string): boolean {
  const formatter = getFormatter(blockType);
  
  if (!formatter || !formatter.isPartialContent) {
    return false;
  }
  
  return formatter.isPartialContent(content);
}

/**
 * Combine partial content chunks
 * 
 * @param blockType The type of block
 * @param previousContent Previous partial content
 * @param newContent New content to append
 * @returns Combined content or null if not supported
 */
export function combineContentChunks(
  blockType: string,
  previousContent: string,
  newContent: string
): string | null {
  const formatter = getFormatter(blockType);
  
  if (!formatter || !formatter.combineContentChunks) {
    // Default concatenation if no specialized combiner
    return previousContent + newContent;
  }
  
  return formatter.combineContentChunks(previousContent, newContent);
}

// Export individual formatters
export { textFormatter };

// Export types
export * from './types';

// Default export the formatBlock function
export default formatBlock;