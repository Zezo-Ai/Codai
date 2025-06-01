/**
 * Stream Parser
 * 
 * Responsible for parsing the raw stream into structured chunks.
 * Focuses solely on parsing without state management or formatting.
 */

import { EventEmitter } from './EventEmitter';
import { Logger } from './Logger';
import { StreamChunk, ContentDelta } from './types';

// Events emitted by the parser
export type ParserEvent = 
  | 'chunk'      // Raw chunk before parsing
  | 'raw_line'   // Raw line before parsing (for debugging)
  | 'parsed'     // Successfully parsed chunk
  | 'delta'      // Content delta extracted from chunk
  | 'error'      // Error during parsing
  | 'complete';  // Stream completed

/**
 * Configuration for the stream parser
 */
export interface StreamParserConfig {
  debug?: boolean;
  format?: 'openai' | 'anthropic' | 'azure' | 'standard' | 'auto';
  captureRawData?: boolean; // Whether to capture raw data for debugging
}

/**
 * Parser for streaming response data
 */
export class StreamParser {
  private events = new EventEmitter();
  private decoder = new TextDecoder();
  private logger: Logger;
  private lineBuffer = '';
  private config: StreamParserConfig;
  private rawChunks: string[] = []; // Store raw chunks for debugging
  private rawLines: string[] = []; // Store raw lines for debugging

  /**
   * Create a new stream parser
   */
  constructor(config: StreamParserConfig = {}) {
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
   * Subscribe to parser events
   */
  on<T>(event: ParserEvent, handler: (data: T) => void): () => void {
    return this.events.on(event, handler);
  }
  
  /**
   * Get raw chunks for debugging
   */
  getRawChunks(): string[] {
    return [...this.rawChunks];
  }

  /**
   * Get raw lines for debugging
   */
  getRawLines(): string[] {
    return [...this.rawLines];
  }

  /**
   * Parse a stream into chunks
   */
  async parseStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    
    // Reset raw data if capturing
    if (this.config.captureRawData) {
      this.rawChunks = [];
      this.rawLines = [];
    }
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Process any remaining data in buffer
          this.processBufferedLines();
          this.events.emit('complete');
          break;
        }
        
        const chunk = this.decoder.decode(value, { stream: true });
        
        // Capture raw chunk if enabled
        if (this.config.captureRawData) {
          this.rawChunks.push(chunk);
        }
        
        this.events.emit('chunk', chunk);
        
        // Add to line buffer and process complete lines
        this.lineBuffer += chunk;
        this.processBufferedLines();
      }
    } catch (error) {
      this.logger.error('parser', 'Error parsing stream', error);
      this.events.emit('error', error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process any complete lines in the buffer
   */
  private processBufferedLines(): void {
    // Split by newlines, handling both \\n and real newlines
    let lines: string[];
    
    if (this.lineBuffer.includes('\n')) {
      // Handle actual newline characters
      lines = this.lineBuffer.split('\n');
    } else if (this.lineBuffer.includes('\\n')) {
      // Handle escaped newlines
      lines = this.lineBuffer.split('\\n');
    } else {
      // No line breaks found, check if buffer contains complete data
      if (this.lineBuffer.includes('data: ')) {
        // Split by data marker
        lines = this.lineBuffer.split('data: ');
        lines = lines.filter(line => line.trim().length > 0);
        
        // Process complete chunks
        for (const line of lines) {
          this.processLine('data: ' + line.trim());
        }
        
        // Clear buffer
        this.lineBuffer = '';
        return;
      } else if (this.lineBuffer.trim().startsWith('{') && this.lineBuffer.trim().endsWith('}')) {
        // Process as a complete JSON object
        this.processLine(this.lineBuffer);
        this.lineBuffer = '';
        return;
      } else {
        // Keep accumulating
        return;
      }
    }
    
    // Keep the last potentially incomplete line in buffer
    this.lineBuffer = lines.pop() || '';
    
    // Process each complete line
    for (const line of lines) {
      if (line.trim().length > 0) {
        this.processLine(line.trim());
      }
    }
  }

  /**
   * Process a single line from the stream
   * Note: Making this public to support processRawChunk functionality
   */
  processLine(line: string): void {
    if (!line) return;
    
    // Capture raw line if enabled
    if (this.config.captureRawData) {
      this.rawLines.push(line);
    }
    
    // Emit raw line event
    this.events.emit('raw_line', line);
    
    // Handle done marker
    if (line === '[DONE]' || line === 'data: [DONE]') {
      this.logger.debug('parser', 'Received [DONE] marker');
      return;
    }
    
    // Remove "data: " prefix if present
    const dataPrefix = 'data: ';
    const data = line.startsWith(dataPrefix)
      ? line.substring(dataPrefix.length).trim()
      : line.trim();
    
    if (!data) return;
    
    try {
      // Check for non-JSON data that might be status updates or messages
      if (data.startsWith('<') && data.endsWith('>')) {
        // Handle XML-like tags (sometimes used for status updates)
        this.logger.debug('parser', 'Received tag message', { tag: data });
        return;
      }
      
      // Look for non-standard formats
      if (!data.startsWith('{') && !data.startsWith('[')) {
        // Check if this is a text message without JSON
        if (!data.includes('\\n') && !data.includes('\\t')) {
          // Emit as a simple text delta
          this.events.emit('delta', { 
            type: 'text',
            content: data 
          });
          return;
        }
      }
      
      // Try to parse as JSON
      let parsed: StreamChunk;
      try {
        parsed = JSON.parse(data);
      } catch (jsonError) {
        // Some APIs send text content mixed with JSON, try to clean it
        if (data.includes('{') && data.includes('}')) {
          const jsonStart = data.indexOf('{');
          const jsonEnd = data.lastIndexOf('}') + 1;
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            const potentialJson = data.substring(jsonStart, jsonEnd);
            try {
              parsed = JSON.parse(potentialJson);
              this.logger.debug('parser', 'Extracted embedded JSON', { 
                original: data,
                extracted: potentialJson
              });
            } catch (extractError) {
              // Still failed, rethrow original error
              throw jsonError;
            }
          } else {
            throw jsonError;
          }
        } else {
          throw jsonError;
        }
      }
      
      // Emit the parsed data
      this.events.emit('parsed', parsed);
      
      // Extract delta content if present
      const delta = this.extractDelta(parsed);
      if (delta) {
        this.events.emit('delta', delta);
      }
      
    } catch (error) {
      // Instead of just logging, try to handle as simple text content
      this.logger.debug('parser', 'Failed to parse as JSON', { line });
      
      // For resilience, try to extract any text and emit as content
      if (data && typeof data === 'string' && data.length > 0) {
        // Strip any control characters, HTML, etc.
        const cleanText = data
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/\\[rnt]/g, ' ') // Replace escape sequences with space
          .trim();
          
        if (cleanText.length > 0) {
          this.logger.debug('parser', 'Treating as plain text', { content: cleanText });
          this.events.emit('delta', { 
            type: 'text',
            content: cleanText 
          });
        }
      }
    }
  }

  /**
   * Extract delta content from a parsed chunk
   */
  private extractDelta(chunk: StreamChunk): ContentDelta | null {
    try {
      // Handle direct delta property (our preferred format)
      if (chunk.delta) {
        return chunk.delta;
      }
      
      // Handle OpenAI format
      if ('choices' in chunk && Array.isArray((chunk as any).choices)) {
        const choice = (chunk as any).choices[0];
        if (choice) {
          if (choice.delta) {
            // Standard OpenAI delta format
            
            // Check if this delta contains content with meta tags
            if (choice.delta.content && typeof choice.delta.content === 'string') {
              const content = choice.delta.content;
              
              // Check for meta tags
              if (content.includes('<response_json>') || 
                  content.includes('</response_json>') || 
                  content.includes('<version>')) {
                
                // Clone the delta to avoid modifying the original
                const modifiedDelta = { ...choice.delta };
                
                // Strip meta tags from content
                let cleanedContent = content;
                
                // Remove response_json tags
                cleanedContent = cleanedContent.replace(/<response_json>\s*/g, '');
                cleanedContent = cleanedContent.replace(/\s*<\/response_json>/g, '');
                
                // Remove version tags with more robust patterns
                cleanedContent = cleanedContent.replace(/<version>.*?<\/version>\s*/gs, '');
                // Backup pattern for potentially malformed tags
                cleanedContent = cleanedContent.replace(/<version>[^<]*<\/version>/g, '');
                
                // Update the content in the modified delta
                modifiedDelta.content = cleanedContent;
                
                return modifiedDelta;
              }
            }
            
            // If no content or no meta tags, return delta as is
            return choice.delta;
          } else if (choice.message && choice.message.content) {
            // Normal message content (some APIs use this format)
            return {
              type: 'text',
              content: choice.message.content,
              role: choice.message.role
            };
          } else if (choice.finish_reason) {
            // When model identifies a finish reason, but no content
            // Often seen at the end of a stream
            this.logger.debug('parser', 'Finish reason received', { reason: choice.finish_reason });
            return null;
          }
        }
      }
      
      // Handle Anthropic format (content-only chunks)
      if ('content' in chunk && typeof (chunk as any).content === 'string') {
        const content = (chunk as any).content;
        
        // Check for meta tags
        if (content.includes('<response_json>') || 
            content.includes('</response_json>') || 
            content.includes('<version>')) {
          
          // Strip meta tags from content
          let cleanedContent = content;
          
          // Remove response_json tags
          cleanedContent = cleanedContent.replace(/<response_json>\s*/g, '');
          cleanedContent = cleanedContent.replace(/\s*<\/response_json>/g, '');
          
          // Remove version tags with more robust patterns
          cleanedContent = cleanedContent.replace(/<version>.*?<\/version>\s*/gs, '');
          // Backup pattern for potentially malformed tags
          cleanedContent = cleanedContent.replace(/<version>[^<]*<\/version>/g, '');
          
          return {
            type: 'text',
            content: cleanedContent
          };
        }
        
        // If no meta tags, return as is
        return {
          type: 'text',
          content: content
        };
      }
      
      // Handle Anthropic message format
      if ('type' in chunk && (chunk as any).type === 'message' && 'message' in chunk) {
        const message = (chunk as any).message;
        if (message && message.content) {
          const content = message.content;
          
          // Check for meta tags
          if (typeof content === 'string' && 
              (content.includes('<response_json>') || 
               content.includes('</response_json>') || 
               content.includes('<version>'))) {
            
            // Strip meta tags from content
            let cleanedContent = content;
            
            // Remove response_json tags
            cleanedContent = cleanedContent.replace(/<response_json>\s*/g, '');
            cleanedContent = cleanedContent.replace(/\s*<\/response_json>/g, '');
            
            // Remove version tags with more robust patterns
            cleanedContent = cleanedContent.replace(/<version>.*?<\/version>\s*/gs, '');
            // Backup pattern for potentially malformed tags
            cleanedContent = cleanedContent.replace(/<version>[^<]*<\/version>/g, '');
            
            return {
              type: 'text',
              content: cleanedContent,
              role: message.role || 'assistant'
            };
          }
          
          // If no meta tags, return as is
          return {
            type: 'text',
            content: content,
            role: message.role || 'assistant'
          };
        }
      }
      
      // Handle tool call format
      if ('type' in chunk && ((chunk as any).type === 'tool_call' || (chunk as any).type === 'action')) {
        return {
          type: (chunk as any).type,
          content: (chunk as any).content || '',
          metadata: (chunk as any).metadata || {}
        };
      }
      
      // Handle expert mode status updates
      if ('type' in chunk && (chunk as any).type === 'expert_mode_status') {
        this.logger.info('parser', 'Expert mode status received', {
          status: (chunk as any).status,
          message: (chunk as any).message
        });
        return {
          type: 'system',
          content: (chunk as any).message || 'Processing...',
          metadata: {
            status: (chunk as any).status,
            isExpertMode: true
          }
        };
      }
      
      // Handle thinking and other direct status events
      if ('type' in chunk && typeof (chunk as any).type === 'string') {
        const eventType = (chunk as any).type;
        if (eventType.includes('thinking') || eventType.includes('status')) {
          // Pass through these events directly
          return chunk as ContentDelta;
        }
      }
      
      // Handle token updates
      if (chunk.token_count !== undefined) {
        return {
          type: 'token_update',
          metadata: {
            token_count: chunk.token_count,
            max_context_tokens: chunk.max_context_tokens,
            needs_summary: chunk.needs_summary
          }
        };
      }
      
      // Handle Azure OpenAI format
      if ('arguments' in chunk && 'name' in chunk) {
        return {
          type: 'tool_call',
          content: JSON.stringify(chunk),
          metadata: {
            name: (chunk as any).name,
            arguments: (chunk as any).arguments
          }
        };
      }
      
      // If we get here, try to extract any recognizable content
      const anyChunk = chunk as any;
      if (anyChunk.text || anyChunk.content) {
        return {
          type: 'text',
          content: anyChunk.text || anyChunk.content
        };
      }
      
      // For unknown formats, log and return null
      this.logger.debug('parser', 'Unknown chunk format', { chunk });
      return null;
    } catch (error) {
      this.logger.error('parser', 'Error extracting delta', error);
      return null;
    }
  }
}