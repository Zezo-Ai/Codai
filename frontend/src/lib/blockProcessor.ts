/**
 * Block Processor - Layer 2: Block Extraction & Processing
 * 
 * Extracts structured content blocks from state content.
 * This implements Layer 2 of the Three-Layer Content Processing Architecture:
 * - Extracts block structures from state content
 * - Identifies block types (text, code, etc.)
 * - Cleans content by removing markup tags
 * - Assigns sequential numerical IDs to blocks
 */

import { StreamState } from './streamStates';

/**
 * Represents a processed block ready for formatting
 */
export interface ProcessedBlock {
  number: number;
  type: string;
  content: string;
  state: StreamState;
  metadata?: Record<string, any>;
}

/**
 * Block processor that extracts and processes blocks from state content
 */
export class BlockProcessor {
  private blockCounter = 0;
  
  /**
   * Reset the block counter
   */
  reset(): void {
    this.blockCounter = 0;
  }
  
  /**
   * Process state content into structured blocks
   */
  processStateContent(state: StreamState, content: string[]): ProcessedBlock[] {
    const blocks: ProcessedBlock[] = [];
    
    // Handle different states
    switch (state) {
      case 'CONTENT':
        blocks.push(...this.extractContentBlocks(state, content));
        break;
      case 'TOOL_CALL':
        blocks.push(...this.extractToolCallBlocks(state, content));
        break;
      case 'TOOL_RESULT':
        blocks.push(...this.extractToolResultBlocks(state, content));
        break;
      case 'FIRST_DELTA':
        blocks.push(...this.extractContentBlocks(state, content));
        break;
      // Other states can be processed similarly
    }
    
    return blocks;
  }
  
  /**
   * Extract blocks from content state
   */
  private extractContentBlocks(state: StreamState, content: string[]): ProcessedBlock[] {
    const blocks: ProcessedBlock[] = [];
    const uniqueBlocks = new Set<string>();
    
    // Look for XML-style blocks
    const combinedContent = content.join('');
    const blockMatches = combinedContent.match(/(<block type="[^"]*">)([\s\S]*?)(<\/block>)/g);
    
    if (blockMatches) {
      blockMatches.forEach(blockMatch => {
        // Avoid duplicate blocks
        if (uniqueBlocks.has(blockMatch)) return;
        uniqueBlocks.add(blockMatch);
        
        // Extract block type
        const typeMatch = blockMatch.match(/type="([^"]*)"/);
        const blockType = typeMatch ? typeMatch[1] : 'text';
        
        // Extract block content - remove the opening and closing tags
        let blockContent = blockMatch
          .replace(/<block type="[^"]*">/, '')
          .replace(/<\/block>/, '')
          .trim();
        
        // Create the processed block
        blocks.push({
          number: ++this.blockCounter,
          type: blockType,
          content: blockContent,
          state
        });
      });
    }
    
    return blocks;
  }
  
  /**
   * Extract blocks from tool call state
   */
  private extractToolCallBlocks(state: StreamState, content: string[]): ProcessedBlock[] {
    // Extract tool call JSON
    const combinedContent = content.join('');
    const toolCallMatch = combinedContent.match(/(\{"operation": "[^"]+".*?\})/);
    
    if (toolCallMatch) {
      const toolCallContent = toolCallMatch[1];
      
      return [{
        number: ++this.blockCounter,
        type: 'tool_call',
        content: toolCallContent,
        state,
        metadata: {
          // Try to extract operation type
          operation: toolCallContent.match(/"operation":\s*"([^"]+)"/)?.at(1) || 'unknown'
        }
      }];
    }
    
    return [];
  }
  
  /**
   * Extract blocks from tool result state
   */
  private extractToolResultBlocks(state: StreamState, content: string[]): ProcessedBlock[] {
    const combinedContent = content.join('');
    
    // Check for different tool result patterns
    if (combinedContent.includes('Contents of directory:')) {
      return [{
        number: ++this.blockCounter,
        type: 'tool_result',
        content: combinedContent,
        state,
        metadata: {
          resultType: 'directory_listing'
        }
      }];
    }
    
    if (combinedContent.includes('🔍 View File')) {
      return [{
        number: ++this.blockCounter,
        type: 'tool_result',
        content: combinedContent,
        state,
        metadata: {
          resultType: 'file_view'
        }
      }];
    }
    
    // Generic tool result
    return [{
      number: ++this.blockCounter,
      type: 'tool_result',
      content: combinedContent,
      state
    }];
  }
  
  /**
   * Process a complete state machine output to extract blocks
   * 
   * This method is adapted to work with both the old and new state machine implementations.
   */
  processStateMachine(states: Record<string, { id: string, blocks: number[], content: string[] }>): ProcessedBlock[] {
    // Check if states is empty or invalid
    if (!states || Object.keys(states).length === 0) {
      return [];
    }
    
    const allBlocks: ProcessedBlock[] = [];
    
    // Process each state in order
    const stateOrder: StreamState[] = ['INITIAL', 'ROLE', 'TOKENS', 'FIRST_DELTA', 'CONTENT', 'TOOL_CALL', 'TOOL_RESULT', 'COMPLETION', 'END'];
    
    for (const stateType of stateOrder) {
      const stateKey = stateType.toLowerCase();
      const stateData = states[stateKey];
      
      if (stateData?.content?.length > 0) {
        try {
          // Process this state's content
          const stateBlocks = this.processStateContent(stateType, stateData.content);
          allBlocks.push(...stateBlocks);
        } catch (e) {
          console.error(`Error processing state ${stateType}:`, e);
          // Create a simple fallback block for this state
          allBlocks.push({
            number: ++this.blockCounter,
            type: 'text',
            content: `State: ${stateType}`,
            state: stateType
          });
        }
      }
    }
    
    return allBlocks;
  }
}