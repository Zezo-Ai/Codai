/**
 * Tool Formatters Registry
 * Maps tool names to their specific formatters
 */

import { formatFolderOps } from './folderOpsFormatter';
import { formatScreenshot } from './screenshotFormatter';
import { formatFileView } from './fileViewFormatter';

// Define the formatter function type
export type ToolFormatter = (content: string, metadata?: Record<string, any>) => string;

// Registry of all available formatters
export const formatters: Record<string, ToolFormatter> = {
  // Core system tools
  'folder_ops': formatFolderOps,
  'screenshot': formatScreenshot,
  'str_replace_editor': formatFileView,
  // Add more formatters as they're developed
  // 'web_search': formatWebSearch,
  // 'web_fetch': formatWebFetch,
  // 'computer': formatComputerTool,
};

/**
 * Get a formatter for a specific tool
 * @param toolName The name of the tool
 * @returns The formatter function or null if not found
 */
export function getFormatter(toolName: string): ToolFormatter | null {
  return formatters[toolName] || null;
}

/**
 * Format content using the appropriate tool formatter
 * @param content The raw content to format
 * @param toolName The name of the tool that generated the content
 * @param metadata Optional metadata to pass to the formatter
 * @returns Formatted HTML string
 */
export function formatToolContent(content: string, toolName: string, metadata?: Record<string, any>): string {
  // Get the formatter for this tool
  const formatter = getFormatter(toolName);
  
  // Log metadata for debugging
  if (metadata) {
    console.log(`[formatRegistry] Formatting ${toolName} with metadata:`, metadata);
  }
  
  // If we have a formatter, use it
  if (formatter) {
    try {
      // Pass metadata to the formatter if available
      return formatter(content, metadata);
    } catch (error) {
      console.error(`Error using formatter for ${toolName}:`, error);
      // Fall back to default formatting
      return `<div style="white-space: pre-wrap;">${content}</div>`;
    }
  }
  
  // Default formatting for unknown tools
  return `<div style="white-space: pre-wrap;">${content}</div>`;
}