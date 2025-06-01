/**
 * BlockHandling.ts
 * 
 * Contains the implementation of enhanced block tag handling for StreamProcessor
 */

import { StreamProcessor } from './StreamProcessor';
import { BlockTagParser, TagParseResult } from '../BlockTagParser';
import { BlockManager } from '../BlockManager';
import { processBlockContent } from '../contentProcessor';
import { shouldRenderBlock } from '../stateRenderControl';
import { ContentType } from './types';

/**
 * Enhanced implementation of text data handling with block-tag awareness.
 * 
 * This implementation is designed to be mixed in with the StreamProcessor class.
 */
export function enhanceStreamProcessorWithBlockHandling(StreamProcessor: any) {
  // Store the original handleTextData method if it exists
  const originalHandleTextData = StreamProcessor.prototype.handleTextData;
  
  // Replace the handleTextData method with our enhanced version
  StreamProcessor.prototype.handleTextData = function(delta: any): void {
    // Get the content from the delta
    const content = delta.content || '';
    
    if (this.debugBlockHandling) {
      console.log(`%c[BLOCK HANDLER] Processing content: ${content.length} chars`, 'color: #4B5563; font-weight: bold;');
    }
    
    // Enable raw content preservation mode in the block tag parser
    if (this.blockTagParser) {
      // Preserve raw content
      if (typeof this.blockTagParser.setPreserveRawContent === 'function') {
        this.blockTagParser.setPreserveRawContent(true);
      }
      
      // Strip meta tags (response_json, version)
      if (typeof this.blockTagParser.setStripMetaTags === 'function') {
        this.blockTagParser.setStripMetaTags(true);
      }
    }
    
    // Process content through the tag parser
    const parseResults = this.blockTagParser.processChunk(content);
    
    // Process each result from the parser
    for (const result of parseResults) {
      this.processParseResult(result);
    }
  };
  
  // Add helper methods for block handling
  StreamProcessor.prototype.processParseResult = function(result: TagParseResult): void {
    if (result.action === 'block_start') {
      // Starting new block
      this.handleBlockStart(result.blockType || 'unknown');
    }
    else if (result.action === 'block_content') {
      // Content for current block
      this.handleBlockContent(result.blockType || 'unknown', result.content || '');
    }
    else if (result.action === 'block_end') {
      // End of block
      this.handleBlockEnd(result.blockType || 'unknown');
    }
    else {
      // Regular content outside blocks
      if (result.content) {
        this.textBuffer += result.content;
        this.updateMessageContent();
      }
    }
  };
  
  StreamProcessor.prototype.handleBlockStart = function(blockType: string): void {
    // Create block and get its ID
    const blockId = this.blockManager.createBlock(blockType);
    
    // Emit block_start event
    this.events.emit('block_start', {
      type: blockType,
      blockId
    });
    
    // Only create a segment if this block type should be rendered
    if (shouldRenderBlock(blockType)) {
      // Create UI segment for this block
      const segmentId = this.createSegmentForBlock(blockId, blockType);
      this.blockManager.setBlockSegment(blockId, segmentId);
      
      this.logger.debug('stream', `Created segment for block: ${blockType}, ID: ${segmentId}`);
    } else {
      this.logger.debug('stream', `Block type not rendered: ${blockType}`);
    }
  };
  
  StreamProcessor.prototype.handleBlockContent = function(blockType: string, content: string): void {
    // Get active block from manager
    const activeBlock = this.blockManager.getActiveBlock();
    
    if (activeBlock) {
      // Update block content - keep raw content unchanged
      this.blockManager.appendToBlock(activeBlock.id, content);
      
      // Update UI segment if we have one
      if (activeBlock.segmentId) {
        // Pass true to preserveRawContent
        this.updateSegmentContent(
          activeBlock.segmentId, 
          activeBlock.content, 
          activeBlock.type, 
          false, // Not final
          { preserveRawContent: true } // Preserve raw content
        );
      }
    } else {
      // No active block, treat as regular content
      this.textBuffer += content;
      this.updateMessageContent();
      
      this.logger.warn('stream', `Received block content but no active block: ${blockType}`);
    }
  };
  
  StreamProcessor.prototype.handleBlockEnd = function(blockType: string): void {
    // Get active block from manager
    const activeBlock = this.blockManager.getActiveBlock();
    
    if (activeBlock) {
      // Complete the block
      this.blockManager.completeBlock(activeBlock.id);
      
      // Final update to segment with completed content
      if (activeBlock.segmentId) {
        this.updateSegmentContent(
          activeBlock.segmentId, 
          activeBlock.content, 
          activeBlock.type, 
          true,
          { preserveRawContent: true } // Preserve raw content in final update too
        );
      }
      
      // Emit block_end event
      this.events.emit('block_end', {
        type: activeBlock.type,
        blockId: activeBlock.id
      });
      
      this.logger.debug('stream', `Completed block: ${activeBlock.type}, ID: ${activeBlock.id}`);
    } else {
      this.logger.warn('stream', `Received block end but no active block: ${blockType}`);
    }
  };
  
  StreamProcessor.prototype.createSegmentForBlock = function(blockId: string, blockType: string): string {
    // Generate a unique segment ID
    const segmentId = this.generateId();
    
    // Create an empty segment for this block
    this.appendSegmentOrCreate(
      blockType as ContentType, // Use block type as content type
      '',  // Start with empty content
      {
        blockId,
        blockType
      }
    );
    
    return segmentId;
  };
  
  StreamProcessor.prototype.updateSegmentContent = function(
    segmentId: string, 
    content: string, 
    blockType: string,
    isFinal: boolean = false,
    metadata?: Record<string, any>
  ): void {
    // Get the last message
    const lastMessage = this.messageManager.getLastMessage();
    if (!lastMessage) return;
    
    // Find the segment
    const segment = lastMessage.segments.find(s => s.id === segmentId);
    if (segment) {
      // Process block content based on type
      const processedContent = processBlockContent(blockType, content, metadata);
      
      // Update the segment
      this.messageManager.updateSegment(
        lastMessage.id,
        segment.id,
        processedContent
      );
      
      // If this is the final update, add any completion markers/formatting
      if (isFinal && this.debugBlockHandling) {
        console.log(`%c[BLOCK HANDLER] Final block update: ${blockType}, ID: ${segmentId}`, 'color: #10B981; font-weight: bold;');
      }
    }
  };
  
  // Add a public method to toggle block debugging
  StreamProcessor.prototype.toggleBlockDebug = function(enabled: boolean): void {
    this.debugBlockHandling = enabled;
    console.log(`Block debugging ${enabled ? 'enabled' : 'disabled'}`);
  };
  
  return StreamProcessor;
}