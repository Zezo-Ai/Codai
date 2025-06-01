/**
 * BlockTagParser.ts
 * 
 * A state machine-based parser for detecting and extracting block tags
 * from streaming content.
 */

// Tag parser states for the state machine
export enum TagParserState {
  NORMAL,             // Not in a tag
  TAG_OPEN_START,     // Found '<'
  TAG_OPEN_NAME,      // Parsing 'block'
  TAG_ATTRIBUTES,     // Parsing attributes (after 'block' before '>')
  TAG_TYPE_ATTR,      // Found 'type='
  TAG_TYPE_VALUE,     // Parsing type value
  TAG_OPEN_COMPLETE,  // Complete opening tag
  IN_BLOCK_CONTENT,   // Content inside a block
  TAG_CLOSE_START,    // Found '</'
  TAG_CLOSE_NAME,     // Parsing '/block'
  TAG_CLOSE_COMPLETE  // Complete closing tag
}

// Result from tag parsing
export interface TagParseResult {
  action: 'none' | 'block_start' | 'block_content' | 'block_end';
  blockType?: string;
  content?: string;
  complete: boolean;  // Whether the current parsing operation is complete
}

/**
 * BlockTagParser - Character-level state machine parser for block tags
 */
export class BlockTagParser {
  private state: TagParserState = TagParserState.NORMAL;
  private tagBuffer: string = '';
  private contentBuffer: string = '';
  private typeBuffer: string = '';
  private quoteChar: string | null = null;
  private blockStack: string[] = []; // Track nested blocks by type
  private debug: boolean = false;
  private preserveRawContent: boolean = true; // Flag to preserve raw content including tags
  private incompleteTag: string | null = null; // For handling tags split across chunk boundaries
  private stripMetaTags: boolean = true; // Whether to strip meta tags (response_json, version)
  
  constructor(debug: boolean = false, preserveRawContent: boolean = true, stripMetaTags: boolean = true) {
    this.debug = debug;
    this.preserveRawContent = preserveRawContent;
    this.stripMetaTags = stripMetaTags;
  }
  
  /**
   * Process a chunk of content through the state machine
   * 
   * @param chunk Content chunk to process
   * @returns Array of parse results
   */
  processChunk(chunk: string): TagParseResult[] {
    const results: TagParseResult[] = [];
    
    // If we have incomplete tag from previous chunk, prepend it
    if (this.incompleteTag) {
      chunk = this.incompleteTag + chunk;
      this.incompleteTag = null;
    }
    
    // Check for potentially incomplete tags at chunk boundaries
    if (chunk.endsWith('<') || chunk.endsWith('</') || 
        (chunk.includes('<block') && !chunk.includes('</block>')) ||
        (chunk.includes('<version') && !chunk.includes('</version>')) ||
        (chunk.includes('<response_json>') && !chunk.includes('</response_json>'))) {
      // Store this chunk for the next call, but emit nothing now
      this.incompleteTag = chunk;
      return [];
    }
    
    // When preserving raw content, we still detect the blocks
    // but we pass the content through unchanged
    if (this.preserveRawContent) {
      // First detect if this contains a block tag
      const hasOpeningBlockTag = chunk.includes('<block');
      const hasClosingBlockTag = chunk.includes('</block>');
      const hasResponseJsonOpen = chunk.includes('<response_json>');
      const hasResponseJsonClose = chunk.includes('</response_json>');
      const hasVersionTag = chunk.includes('<version>');
      
      // Extract content, optionally stripping meta tags
      let processedContent = chunk;
      
      // Strip meta tags if enabled
      if (this.stripMetaTags) {
        // Remove response_json tags
        processedContent = processedContent.replace(/<response_json>\s*/g, '');
        processedContent = processedContent.replace(/\s*<\/response_json>/g, '');
        
        // Remove version tags - more comprehensive pattern
        processedContent = processedContent.replace(/<version>.*?<\/version>\s*/gs, '');
        
        // For extra safety, also try a more lenient version tag match (handles potentially malformed version tags)
        processedContent = processedContent.replace(/<version>[^<]*<\/version>/g, '');
      }
      
      // Extract block type if present
      let blockType = 'text'; // Default
      if (hasOpeningBlockTag) {
        const blockTypeMatch = chunk.match(/<block\s+type=["']([^"']*)["']/);
        if (blockTypeMatch && blockTypeMatch[1]) {
          blockType = blockTypeMatch[1];
        }
      }
      
      // Determine the appropriate action based on tag presence
      if (hasOpeningBlockTag && hasClosingBlockTag) {
        // Complete block
        results.push({
          action: 'block_start',
          blockType: blockType,
          content: processedContent,
          complete: true
        });
      } else if (hasOpeningBlockTag) {
        // Block start
        results.push({
          action: 'block_start',
          blockType: blockType,
          content: processedContent,
          complete: true
        });
      } else if (hasClosingBlockTag) {
        // Block end
        results.push({
          action: 'block_end',
          blockType: blockType,
          content: processedContent,
          complete: true
        });
      } else if (hasResponseJsonOpen || hasResponseJsonClose || hasVersionTag) {
        // Special tags - treat as block content but only if we're not stripping them
        if (!this.stripMetaTags) {
          results.push({
            action: 'block_content',
            blockType: 'special',
            content: processedContent,
            complete: true
          });
        } else if (processedContent.trim().length > 0) {
          // If we're stripping meta tags but there's still content, add it
          results.push({
            action: 'none',
            content: processedContent,
            complete: true
          });
        }
      } else {
        // Regular content
        results.push({
          action: 'none',
          content: processedContent,
          complete: true
        });
      }
      
      return results;
    }
    
    // Regular tag parsing if not preserving raw content
    // Process the chunk character by character for precision
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      const nextChar = i < chunk.length - 1 ? chunk[i + 1] : '';
      
      // Process based on current state
      switch (this.state) {
        case TagParserState.NORMAL:
          // Check for start of an opening tag
          if (char === '<' && nextChar === 'b') {
            // Possible start of <block
            if (this.contentBuffer) {
              // Emit any content we've accumulated before the tag
              results.push({
                action: 'none',
                content: this.contentBuffer,
                complete: true
              });
              this.contentBuffer = '';
            }
            this.tagBuffer = '<';
            this.state = TagParserState.TAG_OPEN_START;
          } 
          // Check for start of a closing tag
          else if (char === '<' && nextChar === '/') {
            if (this.contentBuffer) {
              // We're potentially ending a block, emit content
              results.push({
                action: 'none',
                content: this.contentBuffer,
                complete: true
              });
              this.contentBuffer = '';
            }
            this.tagBuffer = '<';
            this.state = TagParserState.TAG_CLOSE_START;
          } 
          // Regular content
          else {
            this.contentBuffer += char;
          }
          break;
          
        case TagParserState.TAG_OPEN_START:
          this.tagBuffer += char;
          // Check if we're building "<block"
          if (this.tagBuffer === '<b' && char === 'b') {
            // Continue collecting tag name
          } 
          else if (this.tagBuffer === '<bl' && char === 'l') {
            // Continue collecting tag name
          }
          else if (this.tagBuffer === '<blo' && char === 'o') {
            // Continue collecting tag name
          }
          else if (this.tagBuffer === '<bloc' && char === 'c') {
            // Continue collecting tag name
          }
          else if (this.tagBuffer === '<block' && char === 'k') {
            // Complete block tag name
            this.state = TagParserState.TAG_ATTRIBUTES;
          }
          else {
            // Not a block tag, revert to normal and treat as content
            this.contentBuffer += this.tagBuffer;
            this.tagBuffer = '';
            this.state = TagParserState.NORMAL;
          }
          break;
          
        case TagParserState.TAG_ATTRIBUTES:
          this.tagBuffer += char;
          
          // Look for type attribute
          if (char === 't' && this.tagBuffer.endsWith(' t')) {
            // Potential start of type attribute
          }
          else if (this.tagBuffer.endsWith(' ty') && char === 'y') {
            // Continue collecting type attribute
          }
          else if (this.tagBuffer.endsWith(' typ') && char === 'p') {
            // Continue collecting type attribute
          }
          else if (this.tagBuffer.endsWith(' type') && char === 'e') {
            // Complete type keyword
          }
          else if (this.tagBuffer.endsWith('type=') || this.tagBuffer.endsWith('type =')) {
            // Found the type attribute, switch to reading its value
            this.state = TagParserState.TAG_TYPE_ATTR;
          }
          else if (char === '>') {
            // End of tag, but no type found or missed detection
            this.state = TagParserState.TAG_OPEN_COMPLETE;
            
            // Check again for type in the whole tag
            const typeMatch = this.tagBuffer.match(/type=(['"])([^'"]+)\1/);
            if (typeMatch && typeMatch[2]) {
              this.typeBuffer = typeMatch[2];
            }
            
            // Handle as generic block or with detected type
            const blockType = this.typeBuffer || 'unknown';
            this.blockStack.push(blockType);
            

            
            results.push({
              action: 'block_start',
              blockType: blockType,
              complete: true
            });
            
            // Reset buffers for next content
            this.tagBuffer = '';
            this.typeBuffer = '';
            this.state = TagParserState.IN_BLOCK_CONTENT;
          }
          break;
          
        case TagParserState.TAG_TYPE_ATTR:
          this.tagBuffer += char;
          
          // Look for start of attribute value
          if ((char === '"' || char === "'") && !this.quoteChar) {
            this.quoteChar = char;
            this.typeBuffer = '';
            this.state = TagParserState.TAG_TYPE_VALUE;
          }
          break;
          
        case TagParserState.TAG_TYPE_VALUE:
          this.tagBuffer += char;
          
          if (char === this.quoteChar) {
            // End of type value
            this.quoteChar = null;
            this.state = TagParserState.TAG_ATTRIBUTES;
            // Continue parsing attributes
          } 
          else if (char === '>' && !this.quoteChar) {
            // Malformed but try to handle it
            this.state = TagParserState.TAG_OPEN_COMPLETE;
            this.blockStack.push(this.typeBuffer || 'unknown');
            

            
            results.push({
              action: 'block_start',
              blockType: this.typeBuffer || 'unknown',
              complete: true
            });
            
            // Reset buffers for next content
            this.tagBuffer = '';
            this.typeBuffer = '';
            this.state = TagParserState.IN_BLOCK_CONTENT;
          }
          else {
            // Collect the type value
            this.typeBuffer += char;
          }
          break;
          
        case TagParserState.IN_BLOCK_CONTENT:
          // Check for potential closing tag
          if (char === '<' && nextChar === '/') {
            // Potential block closing tag
            if (this.contentBuffer) {
              // Emit content before the closing tag
              const currentType = this.blockStack[this.blockStack.length - 1] || 'unknown';
              

              
              results.push({
                action: 'block_content',
                blockType: currentType,
                content: this.contentBuffer,
                complete: true
              });
              this.contentBuffer = '';
            }
            this.tagBuffer = '<';
            this.state = TagParserState.TAG_CLOSE_START;
          }
          // Check for potential nested block
          else if (char === '<' && nextChar === 'b') {
            // Could be a nested block, we'll handle at the next state
            if (this.contentBuffer) {
              // Emit content before the nested opening tag
              const currentType = this.blockStack[this.blockStack.length - 1] || 'unknown';
              

              
              results.push({
                action: 'block_content',
                blockType: currentType,
                content: this.contentBuffer,
                complete: true
              });
              this.contentBuffer = '';
            }
            this.tagBuffer = '<';
            this.state = TagParserState.TAG_OPEN_START;
          }
          else {
            // Regular content inside block
            this.contentBuffer += char;
          }
          break;
          
        case TagParserState.TAG_CLOSE_START:
          this.tagBuffer += char;
          // Looking for "</b"
          if (this.tagBuffer === '</' && char === '/') {
            // Continue collecting closing tag
          }
          else if (this.tagBuffer === '</b' && char === 'b') {
            // Continue collecting closing tag
          }
          else if (this.tagBuffer === '</bl' && char === 'l') {
            // Continue collecting closing tag
          }
          else if (this.tagBuffer === '</blo' && char === 'o') {
            // Continue collecting closing tag
          }
          else if (this.tagBuffer === '</bloc' && char === 'c') {
            // Continue collecting closing tag
          }
          else if (this.tagBuffer === '</block' && char === 'k') {
            // Complete block closing tag name
            this.state = TagParserState.TAG_CLOSE_NAME;
          }
          else {
            // Not a block closing tag, revert to appropriate state
            if (this.blockStack.length > 0) {
              // We're inside a block, revert to in-block content
              this.contentBuffer += this.tagBuffer;
              this.tagBuffer = '';
              this.state = TagParserState.IN_BLOCK_CONTENT;
            } else {
              // Not inside a block, revert to normal
              this.contentBuffer += this.tagBuffer;
              this.tagBuffer = '';
              this.state = TagParserState.NORMAL;
            }
          }
          break;
          
        case TagParserState.TAG_CLOSE_NAME:
          this.tagBuffer += char;
          
          if (char === '>') {
            // Complete closing tag
            this.state = TagParserState.TAG_CLOSE_COMPLETE;
            
            // Pop the last block type
            const closedType = this.blockStack.pop() || 'unknown';
            

            
            results.push({
              action: 'block_end',
              blockType: closedType,
              complete: true
            });
            
            // Reset tag buffer
            this.tagBuffer = '';
            
            // Reset to appropriate state based on block stack
            if (this.blockStack.length > 0) {
              // Still inside outer blocks
              this.state = TagParserState.IN_BLOCK_CONTENT;
            } else {
              // Not in any blocks
              this.state = TagParserState.NORMAL;
            }
          }
          break;
      }
    }
    
    // Handle any remaining content at the end of chunk
    if (this.contentBuffer) {
      if (this.state === TagParserState.NORMAL) {
        // Emit accumulated regular content
        results.push({
          action: 'none',
          content: this.contentBuffer,
          complete: false // Might continue in next chunk
        });
      } else if (this.state === TagParserState.IN_BLOCK_CONTENT) {
        // Emit accumulated block content
        const currentType = this.blockStack[this.blockStack.length - 1] || 'unknown';
        

        
        results.push({
          action: 'block_content',
          blockType: currentType,
          content: this.contentBuffer,
          complete: false // Might continue in next chunk
        });
      }
      
      // Keep content buffer for continuation
      // (Don't clear this.contentBuffer)
    }
    
    return results;
  }
  
  /**
   * Check if we're currently inside a block
   */
  isInBlock(): boolean {
    return this.blockStack.length > 0;
  }
  
  /**
   * Get current block type if any
   */
  getCurrentBlockType(): string | null {
    if (this.blockStack.length > 0) {
      return this.blockStack[this.blockStack.length - 1];
    }
    return null;
  }
  
  /**
   * Get the current state name for debugging
   */
  getCurrentStateName(): string {
    return TagParserState[this.state];
  }
  
  /**
   * Reset parser state
   */
  reset(): void {
    this.state = TagParserState.NORMAL;
    this.tagBuffer = '';
    this.contentBuffer = '';
    this.typeBuffer = '';
    this.quoteChar = null;
    this.blockStack = [];
    this.incompleteTag = null;
    // Don't reset preserveRawContent or stripMetaTags as they are configuration flags
  }
  
  /**
   * Set raw content preservation mode
   */
  setPreserveRawContent(preserve: boolean): void {
    this.preserveRawContent = preserve;
  }
  
  /**
   * Get current raw content preservation setting
   */
  getPreserveRawContent(): boolean {
    return this.preserveRawContent;
  }
  
  /**
   * Set meta tag stripping mode
   */
  setStripMetaTags(strip: boolean): void {
    this.stripMetaTags = strip;
  }
  
  /**
   * Get current meta tag stripping setting
   */
  getStripMetaTags(): boolean {
    return this.stripMetaTags;
  }
}