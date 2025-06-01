/**
 * Tool Call Handler
 * 
 * Specialized handler for tool calls with clean separation
 * from the main stream processing.
 */

import { EventEmitter } from './EventEmitter';
import { Logger } from './Logger';
import { ToolCall, ToolResult } from './types';

/**
 * Configuration for the tool call handler
 */
export interface ToolCallHandlerConfig {
  debug?: boolean;
}

/**
 * Events emitted by the tool call handler
 */
export type ToolCallEvent = 
  | 'call_start'    // Tool call started
  | 'call_complete' // Tool call completed
  | 'result_start'  // Tool result started
  | 'result_complete' // Tool result completed
  | 'error';        // Error during processing

/**
 * Handler for tool and function calls
 */
export class ToolCallHandler {
  private events = new EventEmitter();
  private logger: Logger;
  private config: ToolCallHandlerConfig;
  private activeCalls: Map<string, ToolCall> = new Map();
  private activeResults: Map<string, ToolResult> = new Map();
  private buffer: string = '';

  /**
   * Create a new tool call handler
   */
  constructor(config: ToolCallHandlerConfig = {}) {
    this.config = {
      debug: false,
      ...config
    };
    
    this.logger = new Logger({
      level: this.config.debug ? 'debug' : 'info',
      enabled: this.config.debug
    });
  }

  /**
   * Subscribe to tool call events
   */
  on<T>(event: ToolCallEvent, handler: (data: T) => void): () => void {
    return this.events.on(event, handler);
  }

  /**
   * Process a tool call
   */
  processToolCall(data: any): ToolCall | null {
    try {
      // Extract tool call data
      let toolCall: ToolCall;
      
      // Handle different formats
      if (typeof data === 'string') {
        // Try to parse JSON string
        try {
          toolCall = JSON.parse(data);
        } catch (e) {
          // If not valid JSON, create basic tool call
          toolCall = {
            name: 'unknown',
            arguments: { content: data }
          };
        }
      } else {
        // Use the data directly
        toolCall = {
          name: data.name || data.function?.name || 'unknown',
          arguments: data.arguments || data.function?.arguments || {},
          id: data.id
        };
      }
      
      // Generate ID if not provided
      if (!toolCall.id) {
        toolCall.id = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
      }
      
      // Store active call
      this.activeCalls.set(toolCall.id, toolCall);
      
      this.logger.info('tool', `Processing tool call: ${toolCall.name}`, { 
        id: toolCall.id, 
        arguments: toolCall.arguments 
      });
      
      // Emit event
      this.events.emit('call_start', toolCall);
      
      return toolCall;
    } catch (error) {
      this.logger.error('tool', 'Error processing tool call', error);
      this.events.emit('error', error);
      return null;
    }
  }

  /**
   * Complete a tool call
   */
  completeToolCall(id: string): void {
    const toolCall = this.activeCalls.get(id);
    if (!toolCall) {
      this.logger.warn('tool', `Cannot complete tool call, ID ${id} not found`);
      return;
    }
    
    this.logger.info('tool', `Completed tool call: ${toolCall.name}`, { id });
    this.events.emit('call_complete', toolCall);
  }

  /**
   * Process a tool result
   */
  processToolResult(data: any, toolCallId?: string): ToolResult | null {
    try {
      // Extract tool result data
      let toolResult: ToolResult;
      
      // Handle different formats
      if (typeof data === 'string') {
        // String content
        toolResult = {
          content: data,
          toolCallId
        };
      } else {
        // Object with content
        toolResult = {
          content: data.content || '',
          type: data.type,
          metadata: data.metadata,
          toolCallId: data.toolCallId || toolCallId
        };
      }
      
      // Store active result
      if (toolResult.toolCallId) {
        this.activeResults.set(toolResult.toolCallId, toolResult);
      }
      
      this.logger.info('tool', `Processing tool result`, { 
        toolCallId: toolResult.toolCallId,
        contentLength: toolResult.content.length
      });
      
      // Emit event
      this.events.emit('result_start', toolResult);
      
      return toolResult;
    } catch (error) {
      this.logger.error('tool', 'Error processing tool result', error);
      this.events.emit('error', error);
      return null;
    }
  }

  /**
   * Complete a tool result
   */
  completeToolResult(toolCallId: string): void {
    const toolResult = this.activeResults.get(toolCallId);
    if (!toolResult) {
      this.logger.warn('tool', `Cannot complete tool result, ID ${toolCallId} not found`);
      return;
    }
    
    this.logger.info('tool', `Completed tool result`, { toolCallId });
    this.events.emit('result_complete', toolResult);
  }

  /**
   * Add content to the tool result buffer
   */
  appendToResult(content: string, toolCallId: string): void {
    // Get existing result or create new one
    let result = this.activeResults.get(toolCallId);
    if (!result) {
      result = {
        content: '',
        toolCallId
      };
      this.activeResults.set(toolCallId, result);
    }
    
    // Append content
    result.content += content;
    
    this.logger.debug('tool', `Appended to tool result`, {
      toolCallId,
      contentLength: content.length,
      totalLength: result.content.length
    });
  }

  /**
   * Get all active tool calls
   */
  getActiveCalls(): ToolCall[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get all active tool results
   */
  getActiveResults(): ToolResult[] {
    return Array.from(this.activeResults.values());
  }

  /**
   * Clear state and buffers
   */
  reset(): void {
    this.activeCalls.clear();
    this.activeResults.clear();
    this.buffer = '';
    
    this.logger.debug('tool', 'Reset tool call handler state');
  }

  /**
   * Get the active tool call by ID
   */
  getToolCall(id: string): ToolCall | undefined {
    return this.activeCalls.get(id);
  }

  /**
   * Get the tool result for a tool call
   */
  getToolResult(toolCallId: string): ToolResult | undefined {
    return this.activeResults.get(toolCallId);
  }
}