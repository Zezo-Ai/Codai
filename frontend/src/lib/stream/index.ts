/**
 * Stream Processing Library
 * 
 * This library provides components for handling streaming responses
 * with a clean, modular architecture.
 */

// Export main components
export { StreamProcessor } from './StreamProcessor';
export { StreamParser } from './StreamParser';
export { ContentFormatter } from './ContentFormatter';
export { MessageManager } from './MessageManager';
export { ToolCallHandler } from './ToolCallHandler';
export { Logger } from './Logger';
export { EventEmitter } from './EventEmitter';

// Export types
export type {
  ContentType,
  MessageRole,
  MessageSegment,
  Message,
  ContentDelta,
  StreamChunk,
  TokenInfo,
  StreamProcessorState,
  StreamProcessorConfig,
  ToolCall,
  ToolResult
} from './types';

// Export enhanced StreamProcessor as default
import EnhancedStreamProcessor from './StreamProcessor';
export default EnhancedStreamProcessor;