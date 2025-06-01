/**
 * Stream Data Extractor
 * 
 * A dedicated parser for extracting structured information from raw stream data.
 * Focuses on identifying message types, events, and content structure.
 */

// Message Types
export enum MessageType {
  ROLE_ASSIGNMENT = 'role_assignment',
  TOKEN_UPDATE = 'token_update',
  CONTENT_DELTA = 'content_delta',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  COMPLETION = 'completion',
  THINKING = 'thinking',
  UNKNOWN = 'unknown'
}

// Content Block Types
export enum BlockType {
  TEXT = 'text',
  CODE = 'code',
  ERROR = 'error',
  THINKING = 'thinking',
  TOOL = 'tool',
  JSON = 'json',
  UNKNOWN = 'unknown'
}

// Parsed Message Structure
export interface ParsedMessage {
  id: string;
  timestamp: string;
  type: MessageType;
  rawContent: string;
  parsedContent?: any;
  metadata?: Record<string, any>;
}

// Content Block Structure
export interface ContentBlock {
  id: string;
  type: BlockType;
  content: string;
  metadata?: Record<string, any>;
}

// Generate a simple unique ID
const generateId = () => {
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Extract and parse stream data into structured messages and blocks
 */
export class StreamDataExtractor {
  private rawMessages: string[] = [];
  private parsedMessages: ParsedMessage[] = [];
  private contentBlocks: ContentBlock[] = [];
  private fullContent: string = '';
  private debug: boolean = false;

  /**
   * Create a new stream data extractor
   */
  constructor(options: { debug?: boolean } = {}) {
    this.debug = options.debug || false;
  }

  /**
   * Add raw messages to be processed
   */
  addRawMessages(messages: string[]): void {
    this.rawMessages = [...this.rawMessages, ...messages];
    this.parseMessages();
  }

  /**
   * Clear all data and start fresh
   */
  clear(): void {
    this.rawMessages = [];
    this.parsedMessages = [];
    this.contentBlocks = [];
    this.fullContent = '';
  }

  /**
   * Get all parsed messages
   */
  getParsedMessages(): ParsedMessage[] {
    return [...this.parsedMessages];
  }

  /**
   * Get extracted content blocks
   */
  getContentBlocks(): ContentBlock[] {
    return [...this.contentBlocks];
  }

  /**
   * Get the aggregated full content from all content deltas
   */
  getFullContent(): string {
    return this.fullContent;
  }

  /**
   * Get messages of a specific type
   */
  getMessagesByType(type: MessageType): ParsedMessage[] {
    return this.parsedMessages.filter(msg => msg.type === type);
  }

  /**
   * Get content blocks of a specific type
   */
  getBlocksByType(type: BlockType): ContentBlock[] {
    return this.contentBlocks.filter(block => block.type === type);
  }

  /**
   * Parse all raw messages into structured data
   */
  private parseMessages(): void {
    // Reset parsed data
    this.parsedMessages = [];
    this.fullContent = '';
    
    this.rawMessages.forEach(rawMessage => {
      // Use current timestamp for all messages
      let timestamp = new Date().toISOString();
      let content = rawMessage;
      
      // Handle 'data:' prefix which is the actual format from the API
      if (content.startsWith('data:')) {
        content = content.substring(5).trim();
      }
      
      // Remove any brackets that might be client-side additions, not part of the raw data
      // This ensures we're parsing the actual API response format
      if (content.startsWith('[') && content.includes(']')) {
        const closingBracketIndex = content.indexOf(']');
        if (closingBracketIndex > 0) {
          // Skip potential client-side timestamp and get to the actual data
          content = content.substring(closingBracketIndex + 1).trim();
          
          // Check again for data: prefix after removing timestamp
          if (content.startsWith('data:')) {
            content = content.substring(5).trim();
          }
        }
      }
      
      // Parse message
      try {
        // Try to parse as JSON
        let jsonData;
        try {
          jsonData = JSON.parse(content);
        } catch (jsonError) {
          // Special handling for common JSON parsing issues
          
          // Handle case where we might have extra text around the JSON
          if (content.includes('{') && content.includes('}')) {
            const startIndex = content.indexOf('{');
            const endIndex = content.lastIndexOf('}') + 1;
            if (startIndex >= 0 && endIndex > startIndex) {
              try {
                const extracted = content.substring(startIndex, endIndex);
                jsonData = JSON.parse(extracted);
                if (this.debug) {
                  console.log('Recovered JSON from partial content:', extracted);
                }
              } catch (e) {
                // Still failed, throw the original error
                throw jsonError;
              }
            } else {
              throw jsonError;
            }
          } else {
            throw jsonError;
          }
        }
        
        // Parse the message
        const parsedMessage = this.parseJsonMessage(jsonData, timestamp, content);
        this.parsedMessages.push(parsedMessage);
        
        // If it's a content delta, add to the full content
        if (parsedMessage.type === MessageType.CONTENT_DELTA && 
            parsedMessage.parsedContent?.content) {
          this.fullContent += parsedMessage.parsedContent.content;
        }
      } catch (e) {
        // Not valid JSON or other parsing error
        // Store more detailed error information for debugging
        const errorDetails = {
          error: 'Failed to parse message',
          errorType: e.name,
          errorMessage: e.message,
          contentStart: content.length > 50 ? content.substring(0, 50) + '...' : content
        };
        
        this.parsedMessages.push({
          id: generateId(),
          timestamp,
          type: MessageType.UNKNOWN,
          rawContent: content,
          metadata: errorDetails
        });
        
        if (this.debug) {
          console.warn('Failed to parse message:', errorDetails, content);
        }
      }
    });
    
    // Extract content blocks after all messages are parsed
    this.extractContentBlocks();
  }

  /**
   * Parse a single JSON message
   */
  private parseJsonMessage(json: any, timestamp: string, rawContent: string): ParsedMessage {
    // Token update message
    if (json.type === 'token_update') {
      return {
        id: generateId(),
        timestamp,
        type: MessageType.TOKEN_UPDATE,
        rawContent,
        parsedContent: {
          tokenCount: json.token_count,
          maxTokens: json.max_context_tokens,
          needsSummary: json.needs_summary,
          percentage: json.threshold_percentage
        },
        metadata: {
          tokenCount: json.token_count,
          maxTokens: json.max_context_tokens
        }
      };
    }
    
    // Handle choices array (OpenAI format)
    if (json.choices && Array.isArray(json.choices) && json.choices.length > 0) {
      const delta = json.choices[0].delta;
      
      // If delta doesn't exist or is empty, this might be a different format
      if (!delta) {
        return {
          id: generateId(),
          timestamp,
          type: MessageType.UNKNOWN,
          rawContent,
          parsedContent: json,
          metadata: { messageFormat: 'choices_without_delta' }
        };
      }
      
      // Role assignment
      if (delta.role) {
        return {
          id: generateId(),
          timestamp,
          type: MessageType.ROLE_ASSIGNMENT,
          rawContent,
          parsedContent: { role: delta.role },
          metadata: { role: delta.role }
        };
      }
      
      // Content delta
      if (delta.content !== undefined) {
        return {
          id: generateId(),
          timestamp,
          type: MessageType.CONTENT_DELTA,
          rawContent,
          parsedContent: {
            type: delta.type || 'text',
            content: delta.content
          },
          metadata: { contentType: delta.type || 'text' }
        };
      }
      
      // Function/tool call
      if (delta.function_call || delta.type === 'function_call') {
        return {
          id: generateId(),
          timestamp,
          type: MessageType.TOOL_CALL,
          rawContent,
          parsedContent: delta.function_call || {},
          metadata: {
            name: delta.function_call?.name || 'unknown'
          }
        };
      }
      
      // Completion marker
      if (delta.finish_reason !== undefined) {
        return {
          id: generateId(),
          timestamp,
          type: MessageType.COMPLETION,
          rawContent,
          parsedContent: { reason: delta.finish_reason },
          metadata: { finishReason: delta.finish_reason }
        };
      }
      
      // Some other delta format we don't recognize
      return {
        id: generateId(),
        timestamp,
        type: MessageType.UNKNOWN,
        rawContent,
        parsedContent: delta,
        metadata: { deltaType: 'unknown' }
      };
    }
    
    // Handle tool results
    if (json.type === 'tool_result') {
      return {
        id: generateId(),
        timestamp,
        type: MessageType.TOOL_RESULT,
        rawContent,
        parsedContent: {
          content: json.content,
          toolCallId: json.tool_call_id
        },
        metadata: {
          toolCallId: json.tool_call_id
        }
      };
    }
    
    // Handle thinking indicator
    if (json.thinking === true) {
      return {
        id: generateId(),
        timestamp,
        type: MessageType.THINKING,
        rawContent,
        parsedContent: { thinking: true },
        metadata: { thinking: true }
      };
    }
    
    // Unknown JSON message
    return {
      id: generateId(),
      timestamp,
      type: MessageType.UNKNOWN,
      rawContent,
      parsedContent: json,
      metadata: { messageType: 'unknown_json' }
    };
  }

  /**
   * Extract structured content blocks from the full content
   */
  private extractContentBlocks(): void {
    // Reset content blocks
    this.contentBlocks = [];
    
    // Handle response_json format with block elements
    if (this.fullContent.includes('<response_json>')) {
      try {
        // Extract version
        const versionMatch = this.fullContent.match(/<version>(.*?)<\/version>/);
        const version = versionMatch ? versionMatch[1] : null;
        
        // Extract blocks
        const blockRegex = /<block type="([^"]+)">([\s\S]*?)<\/block>/g;
        let match;
        
        while ((match = blockRegex.exec(this.fullContent)) !== null) {
          const blockType = match[1];
          const blockContent = match[2].trim();
          
          this.contentBlocks.push({
            id: generateId(),
            type: this.mapBlockType(blockType),
            content: blockContent,
            metadata: { 
              sourceType: 'response_json',
              version
            }
          });
        }
      } catch (e) {
        if (this.debug) {
          console.error('Error extracting response_json blocks:', e);
        }
      }
    }
    
    // Handle code blocks with language identifiers
    if (this.contentBlocks.length === 0 || this.fullContent.includes('```')) {
      try {
        const codeBlockRegex = /```([a-z]*)\n([\s\S]*?)```/g;
        let match;
        
        while ((match = codeBlockRegex.exec(this.fullContent)) !== null) {
          const language = match[1] || 'text';
          const code = match[2].trim();
          
          this.contentBlocks.push({
            id: generateId(),
            type: BlockType.CODE,
            content: code,
            metadata: { 
              language,
              sourceType: 'markdown_code_block'
            }
          });
        }
      } catch (e) {
        if (this.debug) {
          console.error('Error extracting code blocks:', e);
        }
      }
    }
    
    // If no blocks detected, create a single text block with all content
    if (this.contentBlocks.length === 0 && this.fullContent.trim()) {
      this.contentBlocks.push({
        id: generateId(),
        type: BlockType.TEXT,
        content: this.fullContent.trim(),
        metadata: { sourceType: 'plain_content' }
      });
    }
  }

  /**
   * Map block type string to enum
   */
  private mapBlockType(type: string): BlockType {
    switch (type.toLowerCase()) {
      case 'text': return BlockType.TEXT;
      case 'code': return BlockType.CODE;
      case 'error': return BlockType.ERROR;
      case 'thinking': return BlockType.THINKING;
      case 'tool': 
      case 'function': 
      case 'tool_call': 
      case 'function_call': 
        return BlockType.TOOL;
      case 'json': return BlockType.JSON;
      default: return BlockType.UNKNOWN;
    }
  }
}

/**
 * Convert raw stream chunks to parsed data
 */
export function parseStreamData(chunks: string[], options: { debug?: boolean } = {}): {
  messages: ParsedMessage[];
  blocks: ContentBlock[];
  fullContent: string;
} {
  const extractor = new StreamDataExtractor(options);
  extractor.addRawMessages(chunks);
  
  return {
    messages: extractor.getParsedMessages(),
    blocks: extractor.getContentBlocks(),
    fullContent: extractor.getFullContent()
  };
}