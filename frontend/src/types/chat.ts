/**
 * Chat message types for the application
 */

/**
 * Type of content in a message segment
 */
export type ContentType = 
  | 'text'         // Regular text content
  | 'code'         // Code blocks
  | 'tool_call'    // Tool/function calls
  | 'tool_result'  // Results from tool/function calls
  | 'table'        // Tabular data
  | 'image'        // Image content
  | 'thinking'     // Thinking/reasoning process
  | 'file'         // File content
  | 'error'        // Error messages
  | 'warning'      // Warning messages
  | 'system'       // System messages
  | 'unknown';     // Unknown content type

/**
 * Role of the message sender
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'function' | 'tool';

/**
 * Message segment representing a discrete part of a message
 */
export interface MessageSegment {
  id: string;
  type: ContentType;
  content: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

/**
 * Complete message containing one or more segments
 */
export interface Message {
  id: string;
  role: MessageRole;
  segments: MessageSegment[];
  timestamp: string;
  metadata?: Record<string, any>;
}