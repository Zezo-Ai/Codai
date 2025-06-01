/**
 * Stream Processing - Core Types
 * 
 * This file contains the type definitions for the stream processing system.
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
  | 'rich_text'    // Rich text with formatting
  | 'math'         // Mathematical expressions
  | 'diagram'      // Diagrams and visual representations
  | 'note'         // Note blocks
  | 'success'      // Success messages
  | 'info'         // Information messages
  | 'unknown';     // Unknown content type

/**
 * Role of the message sender
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Message segment representing a discrete part of a message
 */
export interface MessageSegment {
  id: string;
  type: ContentType;
  content: string;
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

/**
 * Delta content received from the stream
 */
export interface ContentDelta {
  type?: string;
  content?: string;
  metadata?: Record<string, any>;
  role?: MessageRole;
}

/**
 * Raw stream chunk after basic parsing
 */
export interface StreamChunk {
  type?: string;
  delta?: ContentDelta;
  id?: string;
  finish_reason?: string;
  thinking?: boolean;
  // Token info
  token_count?: number;
  max_context_tokens?: number;
  needs_summary?: boolean;
}

/**
 * Token information for context tracking
 */
export interface TokenInfo {
  count: number;
  max: number;
  needsSummary: boolean;
  percentage: number;
}

/**
 * The possible states for the stream processor
 */
export type StreamProcessorState = 
  | 'idle'      // Not actively processing
  | 'streaming' // Actively receiving stream data
  | 'tool_call' // Processing a tool call
  | 'tool_result' // Processing a tool result
  | 'error'     // Encountered an error
  | 'complete'; // Stream completed successfully

/**
 * Block event information
 */
export interface BlockEvent {
  type: string;
  tag?: string;
  content?: string;
}

/**
 * Configuration for the StreamProcessor
 */
export interface StreamProcessorConfig {
  // Event handlers
  onMessage?: (message: Message) => void;
  onUpdate?: (message: Message) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  onTokenUpdate?: (info: TokenInfo) => void;
  onStateChange?: (state: StreamProcessorState) => void;
  onRawDataUpdate?: (rawData: string[]) => void; // Event for raw data updates
  onBlockStart?: (event: BlockEvent) => void; // Event for block start detection
  onBlockEnd?: (event: BlockEvent) => void; // Event for block end detection
  
  // Debug options
  debug?: boolean;
  showStateMarkers?: boolean;
  captureRawData?: boolean; // Enable capturing raw stream data
}

/**
 * Tool call information
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  id?: string;
}

/**
 * Tool result information
 */
export interface ToolResult {
  toolCallId?: string;
  content: string;
  type?: string;
  metadata?: Record<string, any>;
}