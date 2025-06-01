'use client'

import type { ChatStreamResponse, ChatStreamDelta } from './types'
import StreamStates from '../../lib/streamStates';

/**
 * Silent logger
 */
const logger = {
  debug: (area: string, message: string, data?: any) => {
    // Silent
  },
  error: (area: string, message: string, error?: any) => {
    // Silent
  }
};

/**
 * Handler functions passed to StreamProcessor
 */
export type StreamHandlers = {
  updateState: (updateFn: (prev: any) => any) => void
  handleError: (error: unknown) => void
  onStreamStart?: () => void
  onStreamEnd?: () => void
  onChunkProcessed?: (processedChunk: string, pendingCount: number) => void
  onWaitingApproval?: (pendingChunk: string) => void
  onTokenUpdate?: (tokenInfo: { count: number, max: number, needsSummary: boolean, percentage: number }) => void
}

/**
 * StreamProcessor
 * 
 * Handles reading and parsing a stream, with appropriate
 * manual mode controls and visualization integration.
 * Does NOT handle UI updates - that's the responsibility of the consuming components.
 */
export class StreamProcessor {
  // Reference fields for tracking
  private streamRef: ReadableStreamDefaultReader | null = null;
  private abortControllerRef: AbortController | null = null;
  
  // Processing queue state
  private chunkQueue: string[] = [];
  private isProcessing: boolean = false;
  private pendingConfirmation: boolean = false;
  private lastProcessedTime: number = Date.now(); // Track when last chunk was processed
  private lastProcessedChunk: string = ''; // Keep track of the last processed chunk
  private processingPromise: Promise<void> | null = null; // Track the current processing Promise
  private processingTimeoutId: NodeJS.Timeout | null = null;
  
  // Track chunks with timestamps for logging
  private receivedChunks: Array<{chunk: string, timestamp: number}> = [];
  
  // Manual mode state
  private manualMode: boolean = false;
  private waitingUserApproval: boolean = false;
  private userApprovedChunks: number = 0;
  
  // Stream timeout handling
  private readonly STREAM_TIMEOUT = 300000; // 5 minutes (300000 ms)
  private timeoutId: NodeJS.Timeout | null = null;
  
  // State machine for visualization
  private stateMachine: StreamStates;
  private handlers: StreamHandlers;
  
  /**
   * Create a new StreamProcessor instance
   */
  constructor(handlers: StreamHandlers) {
    this.handlers = handlers;
    
    // Initialize state machine for visualization
    this.stateMachine = new StreamStates('state-machine-container');
  }
  
  /**
   * Process an entire stream from the API
   */
  async processStream(body: ReadableStream<Uint8Array>) {
    logger.debug('stream', 'Starting stream processing');
    
    // Prepare for streaming
    const reader = body.getReader();
    this.streamRef = reader;
    this.abortControllerRef = new AbortController();
    const decoder = new TextDecoder();
    let incompleteChunk = '';
    
    // Add stream start event to queue
    this.enqueueChunk(`data: {"type": "stream_start"}`);
    
    try {
      // Set up timeout monitoring
      this.setupStreamTimeout();
      
      // Set up abort handling
      const signal = this.abortControllerRef.signal;
      signal.addEventListener('abort', () => {
        reader.cancel();
      });
      
      // Process the stream
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Reset the timeout on each chunk
        this.setupStreamTimeout();
        
        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        const fullChunk = incompleteChunk + chunk;
        const lines = fullChunk.split('\n');
        
        // Save the last line if incomplete
        incompleteChunk = lines[lines.length - 1];
        
        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith('data: ')) {
            // Add to processing queue
            this.enqueueChunk(line);
          }
        }
      }
      
      // Process any final incomplete chunk
      if (incompleteChunk && incompleteChunk.startsWith('data: ')) {
        this.enqueueChunk(incompleteChunk);
      }
      
      // Add stream end marker to queue
      this.enqueueStreamEnd();
      
    } catch (error) {
      this.handlers.handleError(error);
    } finally {
      // Clean up resources
      this.cleanupStream();
    }
  }
  
  /**
   * Add a stream end marker with proper manual mode handling
   */
  private enqueueStreamEnd() {
    // Add stream end to the queue
    this.enqueueChunk(`data: {"type": "stream_end"}`);
    
    // In auto mode, mark message as complete
    if (!this.manualMode) {
      this.markMessageComplete();
    }
  }

  /**
   * Public method to inject custom chunks (e.g., expert mode status)
   */
  public injectChunk(chunk: string) {
    this.enqueueChunk(chunk);
  }
  
  // Flag to prevent duplicate message complete handling
  private messageCompleteHandled: boolean = false;
  
  /**
   * Mark the current message as complete
   */
  private markMessageComplete() {
    // Prevent duplicate handling
    if (this.messageCompleteHandled) {
      return;
    }
    
    // Set flag to prevent duplicate calls
    this.messageCompleteHandled = true;
    
    // Notify that stream is complete
    this.handlers.onStreamEnd?.();
    
    // Log all received chunks when the stream is complete
    // console.log('\n\n========== COMPLETE STREAM DATA ==========');
    // console.log(`Total chunks received: ${this.receivedChunks.length}`);
    
    // Calculate and show stream duration if we have chunks
    if (this.receivedChunks.length > 0) {
      const streamDuration = this.receivedChunks.length > 1 ? 
        (this.receivedChunks[this.receivedChunks.length-1].timestamp - this.receivedChunks[0].timestamp) : 0;
      // console.log(`Stream duration: ${streamDuration}ms`);
    }
    
    // console.log('------------------------');
    
    // Format and display the chunks with timestamps
    if (this.receivedChunks.length > 0) {
      const startTime = this.receivedChunks[0].timestamp;
      
      this.receivedChunks.forEach((item, index) => {
        const relativeTime = item.timestamp - startTime;
        // console.log(`\nChunk ${index + 1} (${relativeTime}ms):`);
        // console.log(item.chunk);
        // console.log('------------------------');
      });
    }
    
    // Log the final state HTML (what's shown to the user)
    // console.log('\n\n========== FINAL RESPONSE STATE ==========');
    // console.log(`Timestamp: ${new Date().toISOString()}`);
    
    // Get the HTML state
    const stateHtml = this.getStateHtml();
    
    // 1. Debug-friendly version with escaped characters and visible whitespace
    // console.log('-------- DEBUG VERSION --------');
    const debugHtml = stateHtml
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/ /g, '·'); // Middle dot for spaces
    // console.log(debugHtml);
    
    // 2. Rendered version (what the user sees)
    // console.log('-------- RENDERED VERSION --------');
    // Extract text content by stripping HTML tags
    const renderedText = stateHtml
      .replace(/<[^>]*>/g, '') // Remove all HTML tags
      .replace(/&quot;/g, '"')  // Convert HTML entities back
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'");
    // console.log(renderedText);
  }
  
  /**
   * Set up stream timeout handling
   */
  private setupStreamTimeout() {
    this.clearStreamTimeout();
    this.timeoutId = setTimeout(() => {
      this.handleStreamTimeout();
    }, this.STREAM_TIMEOUT);
  }
  
  /**
   * Clear the stream timeout
   */
  private clearStreamTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
  
  /**
   * Handle stream timeout
   */
  private handleStreamTimeout() {
    this.handlers.handleError(new Error('Stream timeout: No response received within 5 minutes'));
    this.cancelStream();
  }
  
  /**
   * Clean up stream resources
   */
  private cleanupStream() {
    // Clear timers
    this.clearStreamTimeout();
    this.clearProcessingTimeout();
    
    // Clear references
    this.streamRef = null;
    
    // Notify listeners
    this.handlers.onStreamEnd?.();
  }

  /**
   * Cancel an active stream
   */
  public cancelStream() {
    if (this.abortControllerRef) {
      this.abortControllerRef.abort();
      this.abortControllerRef = null;
    }
    
    // Clear processing state
    this.clearProcessingTimeout();
    this.isProcessing = false;
    this.waitingUserApproval = false;
    this.pendingConfirmation = false;
    
    // Clear the queue
    this.chunkQueue = [];
    
    // Note: Do NOT reset thinking state here - that's managed by the parent component
    // Instead, the parent component should capture and restore thinking state
  }
  
  /**
   * Clear the processing timeout
   */
  private clearProcessingTimeout() {
    if (this.processingTimeoutId) {
      clearTimeout(this.processingTimeoutId);
      this.processingTimeoutId = null;
    }
  }
  
  /**
   * Add a chunk to the processing queue
   */
  private enqueueChunk(chunk: string) {
    const isStreamEnd = chunk.includes('"type": "stream_end"');
    
    // Removed logging for cleaner console
    
    // Prevent duplicate stream_end chunks
    if (isStreamEnd && this.chunkQueue.some(c => c.includes('"type": "stream_end"'))) {
      return;
    }
    
    // Store chunk with timestamp for logging
    this.receivedChunks.push({
      chunk: chunk,
      timestamp: Date.now()
    });
    
    // Add to queue - stream_end chunks should always be at the end
    if (isStreamEnd) {
      // If somehow we get a stream_end chunk when others are still in the queue,
      // make sure it's the last one
      this.chunkQueue.push(chunk);
    } else {
      // If we already have a stream_end chunk but then get more normal chunks,
      // insert them before the stream_end
      const streamEndIndex = this.chunkQueue.findIndex(c => c.includes('"type": "stream_end"'));
      if (streamEndIndex >= 0) {
        // Insert before stream_end
        this.chunkQueue.splice(streamEndIndex, 0, chunk);
      } else {
        // Normal case - add to end
        this.chunkQueue.push(chunk);
      }
    }
    
    // Notify UI about new chunk
    this.notifyChunkReceived(chunk);
    
    // Process the queue if appropriate
    if (this.manualMode) {
      // In manual mode, only set waiting for approval
      if (!this.waitingUserApproval && !this.pendingConfirmation && this.chunkQueue.length === 1) {
        this.waitingUserApproval = true;
        this.handlers.onWaitingApproval?.(this.chunkQueue[0]);
      }
      
      // Log the chunk queue ONLY when we get the explicit stream_end event
      // This is the absolute end of the stream
      if (isStreamEnd) {
        // Slight delay to ensure all chunks are in queue
        setTimeout(() => {
          // console.log('=== STREAM FINISHED - FINAL CHUNK QUEUE ===');
          // console.log('Queue length:', this.chunkQueue.length);
          // this.chunkQueue.forEach((queuedChunk, index) => {
          //   if (index < 3 || index >= this.chunkQueue.length - 3) {
          //     // Show first 3 and last 3 chunks if queue is long
          //     console.log(`Chunk ${index + 1}:`, queuedChunk.substring(0, 150) + 
          //       (queuedChunk.length > 150 ? '...' : ''));
          //   } else if (index === 3 && this.chunkQueue.length > 6) {
          //     console.log(`... ${this.chunkQueue.length - 6} more chunks ...`);
          //   }
          // });
          // console.log('=== END OF FINAL CHUNK QUEUE ===');
        }, 50); // Small delay to ensure queue is complete
      }
    } else {
      // In auto mode, process the queue
      if (!this.isProcessing && !this.pendingConfirmation) {
        this.processQueue();
      }
    }
  }
  
  /**
   * Notify UI about a received chunk
   */
  private notifyChunkReceived(chunk: string) {
    try {
      if (typeof window !== 'undefined') {
        // Create a new event with the chunk data
        const event = new CustomEvent('chunkReceived', {
          detail: { chunk }
        });
        
        // Expose notify function globally for debugging
        (window as any).__NOTIFY_CHUNK_RECEIVED = (eventChunk: string) => {
          window.dispatchEvent(new CustomEvent('chunkReceived', {
            detail: { chunk: eventChunk }
          }));
        };
        
        // Dispatch the event
        window.dispatchEvent(event);
      }
    } catch (e) {
      // Silent error handling
    }
  }
  
  /**
   * Process all remaining chunks immediately without any delays
   * Used to ensure we don't leave any chunks unprocessed after stream_end
   */
  private drainRemainingChunks() {
    const remainingChunks = [...this.chunkQueue];
    this.chunkQueue = []; // Clear the queue
    
    // Process all chunks synchronously
    const processChunksSequentially = async () => {
      for (const chunk of remainingChunks) {
        try {
          // Skip any additional stream_end chunks
          if (chunk.includes('"type": "stream_end"')) {
            continue;
          }
          
          await this.processChunk(chunk);
          this.handlers.onChunkProcessed?.(chunk, 0);
        } catch (e) {
          // Silent error handling
        }
      }
      
      // Ensure we're marked as not processing when done
      this.isProcessing = false;
      this.pendingConfirmation = false;
    };
    
    // Start the sequential processing
    processChunksSequentially();
  }

  /**
   * Process chunks from the queue using a reliable Promise-based approach with batched processing
   * This approach reduces the number of state updates by processing multiple chunks together
   */
  private processQueue(): void {
    // Don't process if waiting for manual approval
    if (this.waitingUserApproval) {
      return;
    }
    
    // If a promise is currently processing, don't start another one
    if (this.processingPromise !== null) {
      return;
    }
    
    // Don't process if queue is empty
    if (this.chunkQueue.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    // Start a new processing chain
    this.isProcessing = true;
    
    // Determine batch size based on queue length - process more chunks at once when queue is large
    // This significantly reduces UI updates for better performance
    const queueLength = this.chunkQueue.length;
    const batchSize = queueLength > 100 ? 15 : 
                      queueLength > 50 ? 10 : 
                      queueLength > 20 ? 5 : 
                      queueLength > 10 ? 3 : 1;
    
    // Process a batch of chunks at once to reduce state updates
    this.processingPromise = this.processChunkBatch(batchSize)
      .catch(error => {
        // Silent error handling
      })
      .finally(() => {
        // Always reset the promise when the batch is done
        this.processingPromise = null;
        
        // Check if there are more chunks to process
        if (this.chunkQueue.length > 0 && !this.waitingUserApproval) {
          // Start a new processing chain for remaining chunks
          // Use a faster timeout for larger queues
          const delay = this.chunkQueue.length > 50 ? 0 : 2;
          setTimeout(() => this.processQueue(), delay);
        } else {
          // No more chunks or waiting for approval
          this.isProcessing = false;
        }
      });
  }

  /**
   * Process multiple chunks in a batch to reduce UI updates
   * @param batchSize Number of chunks to process in this batch
   */
  private async processChunkBatch(batchSize: number): Promise<void> {
    if (this.chunkQueue.length === 0) {
      return Promise.resolve();
    }
    
    // Get batch of chunks to process (up to batchSize)
    const chunkCount = Math.min(batchSize, this.chunkQueue.length);
    const chunksToProcess: string[] = [];
    
    for (let i = 0; i < chunkCount; i++) {
      const chunk = this.chunkQueue.shift();
      if (!chunk) break;
      
      // If we encounter a stream_end chunk, handle it specially
      if (chunk.includes('"type": "stream_end"')) {
        // Put it back in the queue and stop adding to batch
        this.chunkQueue.unshift(chunk);
        break;
      }
      
      chunksToProcess.push(chunk);
    }
    
    // If no chunks to process, resolve immediately
    if (chunksToProcess.length === 0) {
      return Promise.resolve();
    }
    
    // If in manual mode, wait for approval
    if (this.manualMode) {
      // Put chunks back in the queue
      for (let i = chunksToProcess.length - 1; i >= 0; i--) {
        this.chunkQueue.unshift(chunksToProcess[i]);
      }
      
      // In manual mode, wait for approval
      this.waitingUserApproval = true;
      
      // Only notify about the first chunk
      if (this.chunkQueue.length > 0) {
        this.handlers.onWaitingApproval?.(this.chunkQueue[0]);
      }
      
      // End the processing chain - will resume when user approves
      return Promise.resolve();
    }
    
    // Process the batch
    try {
      // Flag that we're processing
      this.pendingConfirmation = true;
      this.lastProcessedTime = Date.now();
      
      // Process all chunks in batch
      for (const chunk of chunksToProcess) {
        await this.processChunk(chunk);
        this.lastProcessedChunk = chunk;
      }
      
      // Update timestamp
      this.lastProcessedTime = Date.now();
      
      // Notify only once after all chunks in batch are processed
      if (chunksToProcess.length > 0) {
        this.handlers.onChunkProcessed?.(
          chunksToProcess[chunksToProcess.length - 1], 
          this.chunkQueue.length
        );
      }
      
      // Check if stream_end is next
      const nextChunk = this.chunkQueue.length > 0 ? this.chunkQueue[0] : null;
      const isNextStreamEnd = nextChunk && nextChunk.includes('"type": "stream_end"');
      
      if (isNextStreamEnd) {
        // Process the stream_end chunk
        await this.processNextChunk();
      }
      
      // Reset confirmation flag - batch is done
      this.pendingConfirmation = false;
      
      return Promise.resolve();
    } catch (error) {
      // Reset flags even if processing fails to prevent deadlocks
      this.pendingConfirmation = false;
      
      // Re-throw to signal the error
      throw error;
    }
  }
  
  /**
   * Process the next chunk in the queue, returning a Promise
   * that resolves when the chunk is fully processed
   */
  private async processNextChunk(): Promise<void> {
    if (this.chunkQueue.length === 0) {
      return Promise.resolve();
    }
    
    // Get the next chunk
    const nextChunk = this.chunkQueue.shift();
    if (!nextChunk) return Promise.resolve();
    
    const isStreamEnd = nextChunk.includes('"type": "stream_end"');
    
    // Handle based on mode
    if (this.manualMode) {
      // In manual mode, wait for approval
      this.waitingUserApproval = true;
      this.handlers.onWaitingApproval?.(nextChunk);
      
      // Put the chunk back in the queue
      this.chunkQueue.unshift(nextChunk);
      
      // End the processing chain - will resume when user approves
      return Promise.resolve();
    } 
    
    // In auto mode, process immediately and track completion
    try {
      // Flag that we're processing this chunk
      this.pendingConfirmation = true;
      this.lastProcessedTime = Date.now();
      this.lastProcessedChunk = nextChunk;
      
      // Process the chunk
      await this.processChunk(nextChunk);
      
      // Update timestamp
      this.lastProcessedTime = Date.now();
      
      // Notify that chunk has been processed
      this.handlers.onChunkProcessed?.(nextChunk, this.chunkQueue.length);
      
      // Handle stream_end in auto mode
      if (isStreamEnd) {
        // The stream is complete
        this.markMessageComplete();
        
        // If there are any remaining chunks, drain them immediately
        if (this.chunkQueue.length > 0) {
          await this.processAllRemainingChunks();
        }
      }
      
      // Reset confirmation flag - this chunk is done
      this.pendingConfirmation = false;
      
      return Promise.resolve();
    } catch (error) {
      // Reset flags even if processing fails to prevent deadlocks
      this.pendingConfirmation = false;
      
      // Re-throw to signal the error
      throw error;
    }
  }
  
  /**
   * Process all remaining chunks sequentially with reliable completion
   * @returns Promise that resolves when all chunks are processed
   */
  private async processAllRemainingChunks(): Promise<void> {
    if (this.chunkQueue.length === 0) return;
    
    while (this.chunkQueue.length > 0) {
      const chunk = this.chunkQueue.shift();
      if (!chunk) continue;
      
      try {
        // Skip stream_end chunks since we've already processed one
        if (chunk.includes('"type": "stream_end"')) {
          continue;
        }
        
        await this.processChunk(chunk);
        
        // Notify only if not a stream_end (we already notified for that)
        if (!chunk.includes('"type": "stream_end"')) {
          this.handlers.onChunkProcessed?.(chunk, this.chunkQueue.length);
        }
      } catch (error) {
        // Silent error handling
      }
    }
    return Promise.resolve();
  }
  
  /**
   * Process an individual chunk with optimized handling
   */
  private async processChunk(chunk: string) {
    // Fast processing path for common chunks
    if (!chunk) return;
    
    // GENERAL LOG: Log every 10th chunk to see if we're receiving data
    if (this.chunkSequence % 10 === 0) {
      console.log(`%c[CHUNK RECEIVED #${this.chunkSequence}]`, 'background:#4682b4; color:white; padding:2px 5px; border-radius:3px;', {
        preview: chunk.length > 50 ? chunk.substring(0, 50) + '...' : chunk,
        length: chunk.length,
        timestamp: new Date().toISOString().split('T')[1].split('.')[0]
      });
    }
    
    // Process thinking-related chunks
    if (chunk.includes('"type":"thinking') || 
        chunk.includes('"type": "thinking') ||
        chunk.includes('thinking_block_') || 
        chunk.includes('extended_thinking_status') ||
        chunk.includes('thinking_chunk')) {
      // Removed logging for cleaner console
      
      // PROCESS THINKING CHUNKS: Extract and handle thinking-related chunks
      try {
        // Remove the "data: " prefix and parse the JSON
        const jsonStr = chunk.startsWith('data: ') ? chunk.substring(5).trim() : chunk.trim();
        const parsedData = JSON.parse(jsonStr);
        
        if (parsedData.type === 'thinking_block_start') {
          // Handle thinking block start
          this.handlers.updateState((prev: any) => {
            return {
              ...prev,
              thinkingState: 'active',
              thinkingContent: parsedData.prefix || '',
              thinkingSignature: parsedData.signature || ''
            };
          });
        } 
        else if (parsedData.type === 'thinking_chunk') {
          // Handle thinking chunk - IMPORTANT: Only add to thinking content, not regular content
          this.handlers.updateState((prev: any) => {
            const prevThinkingContent = prev.thinkingContent || '';
            return {
              ...prev,
              thinkingState: 'active',
              thinkingContent: prevThinkingContent + (parsedData.chunk || '')
              // Don't add this content to the regular message content
            };
          });
        }
        else if (parsedData.type === 'thinking_block_end') {
          // Handle thinking block end
          this.handlers.updateState((prev: any) => {
            return {
              ...prev,
              thinkingState: 'complete',
              // Keep thinking content when block ends
              // Don't reset thinkingContent here
            };
          });
        }
        else if (parsedData.type === 'extended_thinking_status') {
          // Handle thinking status
          this.handlers.updateState((prev: any) => {
            return {
              ...prev,
              thinkingState: 'pending',
              thinkingStatus: parsedData.status || 'thinking'
            };
          });
        }
      } catch (e) {
        console.error('Error processing thinking chunk:', e);
      }
    }
    
    // Process chunk with state machine for extraction and accumulation
    // Only compute nextChunk preview if needed for debugging (disabled in production)
    const debugInfo = process.env.NODE_ENV === 'development' ? {
      isStreamEnd: false,
      nextChunk: this.chunkQueue.length > 0 ? 
        (this.chunkQueue[0].length > 50 ? this.chunkQueue[0].substring(0, 50) + '...' : this.chunkQueue[0]) : 
        null,
      queueLength: this.chunkQueue.length
    } : undefined;
    
    // Process in state machine
    this.stateMachine.processChunk(chunk, debugInfo);
    
    // Fast extract of data for control flow handling 
    // Use substring instead of slice for better performance
    const data = chunk.startsWith('data: ') ? chunk.substring(5).trim() : chunk.trim();
    
    // Handle special cases with fast checks
    if (data === '[DONE]' || !data) {
      return;
    }
    
    try {
      // Try to parse as JSON for control flow handling only
      const parsedData = JSON.parse(data);
      
      // Fast type checking using property access
      const type = parsedData.type;
      
      // Handle control messages with direct type checking
      if (type === "stream_start") {
        this.handlers.onStreamStart?.();
        return;
      }
      
      if (type === "stream_end") {
        this.handlers.onStreamEnd?.();
        return;
      }
      
      if (type === "token_update") {
        this.handlers.onTokenUpdate?.({
          count: parsedData.token_count || 0,
          max: parsedData.max_context_tokens || 200000,
          needsSummary: parsedData.needs_summary || false,
          currentPercentage: parsedData.current_percentage || 0,  // Use camelCase consistently
          configThreshold: parsedData.config_threshold || 80  // Default to 80% if not provided
        });
        return;
      }
    } catch (jsonError) {
      // Silent error handling - if we can't parse the JSON, just continue
    }
  }
  
  /**
   * Toggle between automatic and manual processing modes
   * @returns An object containing the new manual mode state and queue status
   */
  public toggleManualMode(enabled: boolean): {
    manualMode: boolean,
    waitingUserApproval: boolean,
    queueLength: number
  } {
    this.manualMode = enabled;
    
    // If switching to auto mode while waiting for approval, process the queue
    if (!enabled && this.waitingUserApproval) {
      this.waitingUserApproval = false;
      this.processQueue();
    }
    
    // If switching to manual mode with pending chunks, set waiting for approval
    if (enabled && this.chunkQueue.length > 0 && !this.waitingUserApproval) {
      this.waitingUserApproval = true;
      this.handlers.onWaitingApproval?.(this.chunkQueue[0]);
    }
    
    // Return the new state
    return {
      manualMode: this.manualMode,
      waitingUserApproval: this.waitingUserApproval,
      queueLength: this.chunkQueue.length
    };
  }
  
  /**
   * Predict the likely state of the next chunk
   * This helps users understand what will happen when they approve a chunk
   * and detect transitions between states (especially tool result boundaries)
   */
  public predictNextChunkState(chunk: string): string | null {
    if (!chunk) return null;
    
    try {
      // Basic state detection - just check for common patterns
      if (chunk.includes('"role": "assistant"')) {
        return 'ROLE';
      } else if (chunk.includes('"type": "token_update"')) {
        return 'TOKEN_UPDATE';
      } else if (chunk.includes('"type": "stream_end"')) {
        return 'END';
      } else if (chunk.includes('"content":')) {
        return 'CONTENT';
      } else {
        return 'CONTENT'; // Default to content
      }
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Process the next chunk when in manual mode
   */
  public approveNextChunk(): {success: boolean, chunkContent: string, nextChunk: string | null} {
    // Error case response
    const errorResult = { success: false, chunkContent: '', nextChunk: null };
    
    // Validate state
    if (!this.manualMode) {
      return errorResult;
    }
    
    if (this.chunkQueue.length === 0) {
      return errorResult;
    }
    
    // Get the chunk that was waiting for approval
    const approvedChunk = this.chunkQueue.shift();
    if (!approvedChunk) return errorResult;
    
    // Check if it's a stream_end chunk
    const isStreamEnd = approvedChunk.includes('"type": "stream_end"');
    
    // Process the chunk
    this.waitingUserApproval = false;
    this.pendingConfirmation = true;
    this.userApprovedChunks++;
    
    // Get the next chunk for preview
    const nextChunk = this.chunkQueue.length > 0 ? this.chunkQueue[0] : null;
    
    // Process the chunk
    this.processChunk(approvedChunk).then(() => {
      // Handle stream_end specially
      if (isStreamEnd) {
        // Mark message as complete now that stream_end is approved
        this.markMessageComplete();
      }
      
      // Notify UI
      this.handlers.onChunkProcessed?.(approvedChunk, this.chunkQueue.length);
      
      // Reset confirmation state
      this.pendingConfirmation = false;
      
      // Set up for next chunk if any
      if (this.chunkQueue.length > 0) {
        this.waitingUserApproval = true;
        this.handlers.onWaitingApproval?.(this.chunkQueue[0]);
        
        // Log the queue state when waiting for next approval
        // console.log('=== AFTER CHUNK APPROVAL - NEXT CHUNK WAITING ===');
        // console.log('Remaining queue length:', this.chunkQueue.length);
        // console.log('Next chunk:', this.chunkQueue[0]?.substring(0, 150) + 
        //   (this.chunkQueue[0]?.length > 150 ? '...' : ''));
        // console.log('=== END OF NEXT CHUNK INFO ===');
      } else {
        this.waitingUserApproval = false;
        this.isProcessing = false;
        
        // Log when all chunks are processed
        // console.log('=== ALL CHUNKS PROCESSED - QUEUE EMPTY ===');
      }
    });
    
    // Return success with chunk info
    return {
      success: true,
      chunkContent: approvedChunk,
      nextChunk: nextChunk
    };
  }
  
  /**
   * Get queue status information
   */
  public getQueueStatus(): {
    pendingChunks: number,
    isProcessing: boolean, 
    waitingApproval: boolean,
    manualMode: boolean,
    approvedChunks: number
  } {
    return {
      pendingChunks: this.chunkQueue?.length || 0,
      isProcessing: this.isProcessing || false,
      waitingApproval: this.waitingUserApproval || false,
      manualMode: this.manualMode || false,
      approvedChunks: this.userApprovedChunks || 0
    };
  }
  
  /**
   * Get the current chunk for preview
   */
  public getCurrentChunk(): string | null {
    return this.chunkQueue.length > 0 ? this.chunkQueue[0] : null;
  }
  
  /**
   * Get current state for visualization
   */
  public getCurrentState() {
    return this.stateMachine.getState();
  }
  
  /**
   * Get the current HTML state
   */
  public getStateHtml(): string {
    // Get HTML directly from the StreamStates instance
    return this.stateMachine.getHtml();
  }
  
  /**
   * Reset the state
   */
  public resetState(): void {
    // Reset counters and flags
    this.chunkQueue = [];
    this.isProcessing = false;
    this.pendingConfirmation = false;
    this.waitingUserApproval = false;
    this.userApprovedChunks = 0;
    
    // Reset message complete flag
    this.messageCompleteHandled = false;
    
    // Clear chunk collection for logging
    this.receivedChunks = [];
    
    // Reset state machine
    this.stateMachine.reset();
    
    // Clear any timeouts
    this.clearStreamTimeout();
    this.clearProcessingTimeout();
  }
}