/**
 * Stream Processor
 * 
 * This is the main class that coordinates the processing of streaming content.
 * It orchestrates the parser, message manager, and formatters.
 */

import { EventEmitter } from './EventEmitter';
import { Logger } from './Logger';
import { StreamParser } from './StreamParser';
import { ContentFormatter } from './ContentFormatter';
import { MessageManager } from './MessageManager';
import { ToolCallHandler } from './ToolCallHandler';
import { 
  StreamProcessorConfig, 
  Message, 
  MessageRole, 
  StreamProcessorState,
  ContentType,
  TokenInfo,
  BlockEvent
} from './types';

// Import block handling components
import { BlockTagParser, TagParseResult } from '../BlockTagParser';
import { BlockManager, Block } from '../BlockManager';
import { processBlockContent } from '../contentProcessor';
import { shouldRenderBlock } from '../stateRenderControl';
import { enhanceStreamProcessorWithBlockHandling } from './BlockHandling';

/**
 * Stream processor for handling streaming responses
 */
export class StreamProcessor {
  private events = new EventEmitter();
  private logger: Logger;
  private parser: StreamParser;
  private formatter: ContentFormatter;
  private messageManager: MessageManager;
  private toolHandler: ToolCallHandler;
  private config: StreamProcessorConfig;
  private state: StreamProcessorState = 'idle';
  private abortController: AbortController | null = null;
  
  // Current message buffers
  private textBuffer = '';
  private activeRole: MessageRole = 'assistant';
  
  // Legacy block tag handling (to be replaced)
  private tagBuffer = '';
  private collectingTag = false;
  private currentBlockType: string | null = null;
  
  // New block handling components
  private blockTagParser: BlockTagParser;
  private blockManager: BlockManager;
  private debugBlockHandling: boolean = false;

  /**
   * Create a new stream processor
   */
  constructor(config: StreamProcessorConfig = {}) {
    this.config = {
      debug: false,
      showStateMarkers: false,
      captureRawData: false,
      ...config
    };
    
    // Initialize logger
    this.logger = new Logger({
      level: this.config.debug ? 'debug' : 'info',
      enabled: this.config.debug
    });
    
    // Initialize components
    this.parser = new StreamParser({ 
      debug: this.config.debug,
      captureRawData: this.config.captureRawData
    });
    this.formatter = new ContentFormatter({ debug: this.config.debug });
    this.messageManager = new MessageManager({ 
      debug: this.config.debug,
      onUpdate: this.handleMessagesUpdate.bind(this)
    });
    this.toolHandler = new ToolCallHandler({ debug: this.config.debug });
    
    // Initialize new block handling components
    this.debugBlockHandling = this.config.debug;
    this.blockTagParser = new BlockTagParser(this.debugBlockHandling);
    this.blockManager = new BlockManager(this.debugBlockHandling);
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Set up block event forwarding
    this.events.on('block_start', (event: BlockEvent) => {
      if (this.config.onBlockStart) {
        this.config.onBlockStart(event);
      }
      this.logger.debug('stream', 'Block start detected', event);
    });
    
    this.events.on('block_end', (event: BlockEvent) => {
      if (this.config.onBlockEnd) {
        this.config.onBlockEnd(event);
      }
      this.logger.debug('stream', 'Block end detected', event);
    });
    
    this.logger.info('stream', 'Stream processor initialized with enhanced block tag handling');
  }

  /**
   * Set up event handlers for components
   */
  private setupEventHandlers(): void {
    // Parser events
    this.parser.on('delta', this.handleDelta.bind(this));
    this.parser.on('error', this.handleError.bind(this));
    this.parser.on('complete', this.handleComplete.bind(this));
    this.parser.on('raw_line', this.handleRawLine.bind(this));
    this.parser.on('chunk', this.handleRawChunk.bind(this));
    
    // Tool handler events
    this.toolHandler.on('call_start', this.handleToolCallStart.bind(this));
    this.toolHandler.on('call_complete', this.handleToolCallComplete.bind(this));
    this.toolHandler.on('result_start', this.handleToolResultStart.bind(this));
    this.toolHandler.on('result_complete', this.handleToolResultComplete.bind(this));
    this.toolHandler.on('error', this.handleError.bind(this));
  }
  
  /**
   * Handle raw line from parser
   */
  private handleRawLine(line: string): void {
    // Only use raw lines for data capture (skip raw chunks)
    if (this.config.captureRawData && this.config.onRawDataUpdate) {
      // Send current raw data to the subscriber
      this.config.onRawDataUpdate(this.parser.getRawLines());
    }
  }
  
  /**
   * Handle raw chunk from parser
   */
  private handleRawChunk(chunk: string): void {
    // Disable this method to prevent duplicate data capture
    // Chunks will be processed into lines and captured by handleRawLine
  }
  
  /**
   * Handle stream completion
   */
  private handleComplete(): void {
    this.logger.info('stream', 'Stream processing complete');
    
    // Force processing any buffered content with stream end flag
    const { StateMachine } = require('../streamStates');
    if (StateMachine && typeof StateMachine.prototype.finalizeStream === 'function') {
      console.log('🏁 Calling StateMachine.finalizeStream() on stream completion');
      // We can't directly access the StateMachine instance, but we can make sure
      // we clean up by setting a flag that we're at stream end
      this.handleRawLine('{"type": "stream_end"}');
    }
    
    // Add completion marker if enabled
    if (this.config.showStateMarkers) {
      this.addStateMarker('complete');
    }
    
    // Update state
    this.setState('complete');
    
    // Notify listeners
    if (this.config.onComplete) {
      this.config.onComplete();
    }
  }

  /**
   * Process a streaming response
   */
  async processStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    try {
      // Cancel any existing stream
      if (this.abortController) {
        this.abortController.abort();
      }
      
      // Create new abort controller
      this.abortController = new AbortController();
      
      // Update state
      this.setState('streaming');
      this.reset();
      
      // Log state
      this.logger.info('stream', 'Starting stream processing');
      
      // Start assistant message if needed
      this.ensureAssistantMessage();
      
      try {
        // Process the stream
        await this.parser.parseStream(stream);
      } catch (parseError) {
        // Handle parser errors specifically
        this.logger.warn('stream', 'Stream parsing error (continuing)', parseError);
        
        // Add warning to message but don't stop processing
        this.textBuffer += "\n\nError while parsing the response stream. Some content may be missing.";
        this.updateMessageContent();
        
        // Continue with complete event rather than error
        this.handleComplete();
        return;
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Handle delta content from parser
   */
  private handleDelta(delta: any): void {
    try {
      this.logger.debug('stream', 'Received delta', { delta });
      
      // Handle token updates
      if (delta.type === 'token_update') {
        this.handleTokenUpdate(delta.metadata);
        return;
      }
      
      // Handle role changes
      if (delta.role) {
        this.handleRoleChange(delta.role);
      }
      
      // Handle content updates
      if (delta.content) {
        this.handleContent(delta);
      }
      
      // Handle specific content types
      if (delta.type) {
        switch (delta.type) {
          case 'action':
          case 'tool_call':
            this.handleToolCallData(delta);
            break;
            
          case 'tool_result':
            this.handleToolResultData(delta);
            break;
            
          case 'text':
            this.handleTextData(delta);
            break;
            
          case 'system':
            this.handleSystemMessage(delta);
            break;
            
          default:
            // For other types, handle as regular content
            this.handleTextData(delta);
        }
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Handle system messages (like expert mode status)
   */
  private handleSystemMessage(delta: any): void {
    this.logger.debug('stream', 'System message received', delta);
    
    // Create a system message segment
    const segment: MessageSegment = {
      id: this.generateId(),
      type: 'system',
      content: delta.content || '',
      metadata: delta.metadata || {}
    };
    
    // Add to current message
    this.messageManager.addSegment(segment);
    
    // Update the message content
    this.updateMessageContent();
    
    // If this is expert mode status, we might want to show it differently
    if (delta.metadata?.isExpertMode) {
      // Could emit a specific event for UI handling
      this.logger.info('stream', 'Expert mode analyzing request', {
        status: delta.metadata.status
      });
    }
  }

  /**
   * Handle token updates
   */
  private handleTokenUpdate(metadata: any): void {
    const tokenInfo: TokenInfo = {
      count: metadata.token_count || 0,
      max: metadata.max_context_tokens || 2000,
      needsSummary: metadata.needs_summary || false,
      percentage: metadata.threshold_percentage || 0
    };
    
    this.logger.debug('stream', 'Token update', tokenInfo);
    
    // Notify listeners
    if (this.config.onTokenUpdate) {
      this.config.onTokenUpdate(tokenInfo);
    }
  }

  /**
   * Handle role changes
   */
  private handleRoleChange(role: MessageRole): void {
    this.logger.debug('stream', `Role changed to: ${role}`);
    this.activeRole = role;
    
    // If changing to assistant role, ensure we have an assistant message
    if (role === 'assistant') {
      this.ensureAssistantMessage();
    }
  }

  /**
   * Handle regular content
   */
  private handleContent(delta: any): void {
    // Skip if processing tool calls or results
    if (this.state === 'tool_call' || this.state === 'tool_result') {
      this.logger.debug('stream', 'Ignoring content during tool processing', { 
        state: this.state,
        content: delta.content
      });
      return;
    }
    
    // Add state markers if enabled
    if (this.config.showStateMarkers) {
      const lastMessage = this.messageManager.getLastMessage();
      if (lastMessage && lastMessage.segments.length === 0) {
        // Add marker for the first content of a message
        this.addStateMarker('start');
      }
    }
    
    // Append to buffer
    this.textBuffer += delta.content;
    
    // Update the message
    this.updateMessageContent();
  }

  /**
   * Handle text data with enhanced block-tag awareness
   * This method will be replaced by the enhanceStreamProcessorWithBlockHandling function
   */
  private handleTextData(delta: any): void {
    // Get the content from the delta
    const content = delta.content || '';
    
    // This method is replaced by the enhanceStreamProcessorWithBlockHandling function
    // The method implementation happens through a mixin pattern
    // So this is just a stub that will be invoked if enhancement fails
    
    // Regular content not in a block (fallback)
    this.handleContent(delta);
  }

  /**
   * Handle tool call data
   */
  private handleToolCallData(delta: any): void {
    // Switch state to tool_call
    this.setState('tool_call');
    
    // Add state markers if enabled
    if (this.config.showStateMarkers && !this.textBuffer.includes('Tool Call')) {
      this.addStateMarker('tool_call_start');
    }
    
    // Process tool call
    const toolCall = this.toolHandler.processToolCall(delta);
    if (toolCall) {
      // Format the tool call
      const formattedCall = this.formatter.format(
        JSON.stringify(toolCall),
        'tool_call',
        { name: toolCall.name, id: toolCall.id }
      );
      
      // Add to message
      this.appendSegmentOrCreate('tool_call', formattedCall, {
        name: toolCall.name,
        id: toolCall.id
      });
    }
  }

  /**
   * Handle tool call starting
   */
  private handleToolCallStart(toolCall: any): void {
    this.logger.info('stream', `Tool call started: ${toolCall.name}`);
    
    if (this.config.showStateMarkers) {
      this.addStateMarker('tool_call_processing', toolCall.name);
    }
  }

  /**
   * Handle tool call completion
   */
  private handleToolCallComplete(toolCall: any): void {
    this.logger.info('stream', `Tool call completed: ${toolCall.name}`);
    
    if (this.config.showStateMarkers) {
      this.addStateMarker('tool_call_complete');
    }
  }

  /**
   * Handle tool result data
   */
  private handleToolResultData(delta: any): void {
    // Switch state to tool_result
    this.setState('tool_result');
    
    // Add state markers if enabled
    if (this.config.showStateMarkers && !this.textBuffer.includes('Tool Result')) {
      this.addStateMarker('tool_result_start');
    }
    
    // Process tool result
    const toolResult = this.toolHandler.processToolResult(delta);
    if (toolResult) {
      // Format the tool result
      const formattedResult = this.formatter.format(
        toolResult.content,
        'tool_result',
        { toolCallId: toolResult.toolCallId }
      );
      
      // Add to message
      this.appendSegmentOrCreate('tool_result', formattedResult, {
        toolCallId: toolResult.toolCallId
      });
    }
  }

  /**
   * Handle tool result starting
   */
  private handleToolResultStart(toolResult: any): void {
    this.logger.info('stream', 'Tool result started', {
      toolCallId: toolResult.toolCallId
    });
    
    if (this.config.showStateMarkers) {
      this.addStateMarker('tool_result_processing');
    }
  }

  /**
   * Handle tool result completion
   */
  private handleToolResultComplete(toolResult: any): void {
    this.logger.info('stream', 'Tool result completed', {
      toolCallId: toolResult.toolCallId
    });
    
    if (this.config.showStateMarkers) {
      this.addStateMarker('tool_result_complete');
    }
    
    // Return to normal streaming state
    this.setState('streaming');
  }

  /**
   * Handle stream completion
   */
  private handleComplete(): void {
    this.logger.info('stream', 'Stream completed');
    
    // Add state markers if enabled
    if (this.config.showStateMarkers) {
      this.addStateMarker('complete');
    }
    
    // Check if we have meaningful content
    const lastMessage = this.messageManager.getLastMessage();
    const hasContent = lastMessage?.segments.some(s => s.content.trim().length > 0);
    
    if (!hasContent) {
      // If no content was received, add a basic message to prevent empty bubbles
      this.textBuffer += "No response received. The server may be busy or the request timed out.";
    } else if (this.textBuffer.trim().length === 0) {
      // If there's no text buffer but there are segments, just log that completion happened
      this.logger.debug('stream', 'Stream completed with segments but empty text buffer');
    }
    
    // Final update
    this.updateMessageContent();
    
    // Set state to complete
    this.setState('complete');
    
    // Notify listeners
    if (this.config.onComplete) {
      this.config.onComplete();
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: any): void {
    this.logger.error('stream', 'Error during stream processing', error);
    
    // Set state to error
    this.setState('error');
    
    // Add error message
    this.appendSegmentOrCreate('error', this.formatter.format(
      error instanceof Error ? error.message : String(error),
      'error'
    ));
    
    // Notify listeners
    if (this.config.onError) {
      this.config.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle messages update
   */
  private handleMessagesUpdate(messages: Message[]): void {
    // Notify listeners
    if (this.config.onUpdate) {
      const lastMessage = messages[messages.length - 1];
      this.config.onUpdate(lastMessage);
    }
    
    if (this.config.onMessage) {
      this.config.onMessage(messages);
    }
  }

  /**
   * Update message content from buffer
   */
  private updateMessageContent(): void {
    if (!this.textBuffer.trim()) return;
    
    // Get or create message
    const lastMessage = this.messageManager.getLastMessage();
    if (!lastMessage || lastMessage.role !== this.activeRole) {
      // Create new message with current content
      const newMessage = this.messageManager.createMessage(
        this.activeRole,
        this.textBuffer,
        'text'
      );
      this.messageManager.addMessage(newMessage);
    } else {
      // Find text segment or create one
      const textSegment = lastMessage.segments.find(s => s.type === 'text');
      if (textSegment) {
        // Update existing segment
        this.messageManager.updateSegment(
          lastMessage.id,
          textSegment.id,
          this.textBuffer
        );
      } else {
        // Add new segment
        this.messageManager.addSegmentToLastMessage(
          'text',
          this.textBuffer
        );
      }
    }
  }

  /**
   * Append a segment to the current message or create a new one
   */
  private appendSegmentOrCreate(type: ContentType, content: string, metadata?: Record<string, any>): void {
    // Get or create message
    const lastMessage = this.messageManager.getLastMessage();
    if (!lastMessage || lastMessage.role !== this.activeRole) {
      // Create new message with segment
      const newMessage = this.messageManager.createMessage(this.activeRole);
      newMessage.segments.push(
        this.messageManager.createSegment(type, content, metadata)
      );
      this.messageManager.addMessage(newMessage);
    } else {
      // Add segment to existing message
      this.messageManager.addSegmentToLastMessage(
        type,
        content,
        metadata
      );
    }
  }

  /**
   * Add a state marker to the text buffer
   */
  private addStateMarker(markerType: string, detail?: string): void {
    if (!this.config.showStateMarkers) return;
    
    let marker = '';
    
    switch (markerType) {
      case 'start':
        marker = '🟢 [Stream starting]\n\n';
        break;
      case 'complete':
        marker = '\n\n🟢 [Stream complete]\n';
        break;
      case 'tool_call_start':
        marker = '\n\n🔧 [Tool call starting]\n';
        break;
      case 'tool_call_processing':
        marker = `\n⚙️ [Processing tool: ${detail || 'unknown'}]\n`;
        break;
      case 'tool_call_complete':
        marker = '\n✅ [Tool call complete]\n\n';
        break;
      case 'tool_result_start':
        marker = '\n\n🔍 [Tool result starting]\n';
        break;
      case 'tool_result_processing':
        marker = '\n⏳ [Processing result]\n';
        break;
      case 'tool_result_complete':
        marker = '\n✅ [Tool result complete]\n\n';
        break;
      default:
        return;
    }
    
    this.textBuffer += marker;
    this.updateMessageContent();
  }

  /**
   * Ensure an assistant message exists
   */
  private ensureAssistantMessage(): void {
    const lastMessage = this.messageManager.getLastMessage();
    if (!lastMessage || lastMessage.role !== 'assistant') {
      const newMessage = this.messageManager.createMessage('assistant');
      this.messageManager.addMessage(newMessage);
      
      this.logger.debug('stream', 'Created new assistant message');
    }
  }

  /**
   * Set the processor state
   */
  private setState(state: StreamProcessorState): void {
    if (this.state === state) return;
    
    this.logger.debug('stream', `State changed: ${this.state} -> ${state}`);
    
    const previousState = this.state;
    this.state = state;
    
    // Notify listeners
    if (this.config.onStateChange) {
      this.config.onStateChange(state);
    }
  }

  /**
   * Reset the processor state
   */
  private reset(): void {
    this.textBuffer = '';
    this.activeRole = 'assistant';
    this.toolHandler.reset();
    
    // Reset legacy tag handling variables
    this.tagBuffer = '';
    this.collectingTag = false;
    this.currentBlockType = null;
    
    // Reset new block handling components
    this.blockTagParser.reset();
    this.blockManager.reset();
    
    this.logger.debug('stream', 'Reset processor state with enhanced block handling');
  }

  /**
   * Cancel the current stream
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      
      this.logger.info('stream', 'Stream cancelled');
      
      // Set state to complete
      this.setState('complete');
      
      // Add cancellation notice
      if (this.config.showStateMarkers) {
        this.textBuffer += '\n\n❌ [Stream cancelled by user]\n';
        this.updateMessageContent();
      }
      
      // Notify listeners
      if (this.config.onComplete) {
        this.config.onComplete();
      }
    }
  }

  /**
   * Get the current processor state
   */
  getState(): StreamProcessorState {
    return this.state;
  }

  /**
   * Get all messages
   */
  getMessages(): Message[] {
    return this.messageManager.getMessages();
  }
  
  /**
   * Send a user message
   */
  addUserMessage(content: string, metadata?: Record<string, any>): void {
    const userMessage = this.messageManager.createMessage('user', content, 'text', metadata);
    this.messageManager.addMessage(userMessage);
    
    this.logger.info('stream', 'Added user message', { 
      messageId: userMessage.id,
      contentLength: content.length 
    });
  }
  
  /**
   * Process a single raw chunk (for playback support)
   * This allows direct processing of saved chunks during playback
   */
  processRawChunk(chunk: string): void {
    try {
      this.logger.debug('stream', 'Processing raw chunk during playback', { chunk });
      
      // If we're not in streaming state, start streaming
      if (this.state !== 'streaming') {
        this.setState('streaming');
        
        // Ensure we have an assistant message to add content to
        this.ensureAssistantMessage();
      }
      
      // Process the raw chunk through the parser
      if (chunk.trim().startsWith('data:')) {
        // SSE format chunk - process it through the parser
        this.parser.processLine(chunk);
      } else {
        // Try to parse as JSON directly
        try {
          const parsed = JSON.parse(chunk);
          this.handleDelta(parsed);
        } catch (e) {
          // Not valid JSON, just process as text
          this.textBuffer += chunk;
          this.updateMessageContent();
        }
      }
    } catch (error) {
      this.logger.error('stream', 'Error processing raw chunk', error);
    }
  }
}

// Enhance the StreamProcessor with block handling
export default enhanceStreamProcessorWithBlockHandling(StreamProcessor);