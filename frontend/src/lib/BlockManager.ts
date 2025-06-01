/**
 * BlockManager.ts
 * 
 * Manages blocks with unique IDs and tracks their content and state.
 */

// Block interface representing a content block
export interface Block {
  id: string;          // Unique identifier
  type: string;        // Block type (code, math, etc.)
  content: string;     // Content of the block
  isComplete: boolean; // Whether the block has been closed
  segmentId: string | null; // Associated UI segment ID
  metadata?: Record<string, any>; // Additional metadata
}

/**
 * BlockManager - Manages blocks and their content
 */
export class BlockManager {
  private blocks: Map<string, Block> = new Map();
  private activeBlockId: string | null = null;
  private nextBlockId: number = 1;
  private debug: boolean = false;
  
  constructor(debug: boolean = false) {
    this.debug = debug;
  }
  
  /**
   * Create a new block and return its ID
   * 
   * @param type Block type
   * @param metadata Optional metadata
   * @returns ID of the created block
   */
  createBlock(type: string, metadata?: Record<string, any>): string {
    const blockId = `block_${Date.now()}_${this.nextBlockId++}`;
    
    this.blocks.set(blockId, {
      id: blockId,
      type,
      content: '',
      isComplete: false,
      segmentId: null,
      metadata
    });
    
    this.activeBlockId = blockId;
    

    
    return blockId;
  }
  
  /**
   * Append content to a block
   * 
   * @param blockId ID of the block to update
   * @param content Content to append
   */
  appendToBlock(blockId: string, content: string): void {
    const block = this.blocks.get(blockId);
    if (block) {
      block.content += content;
      
    }
  }
  
  /**
   * Mark a block as complete
   * 
   * @param blockId ID of the block to complete
   * @returns The completed block or null if not found
   */
  completeBlock(blockId: string): Block | null {
    const block = this.blocks.get(blockId);
    if (block) {
      block.isComplete = true;
      
      if (this.activeBlockId === blockId) {
        this.activeBlockId = null;
      }
      
      return block;
    }
    
    return null;
  }
  
  /**
   * Get the current active block
   * 
   * @returns The active block or null if none
   */
  getActiveBlock(): Block | null {
    if (this.activeBlockId) {
      return this.blocks.get(this.activeBlockId) || null;
    }
    return null;
  }
  
  /**
   * Set active block explicitly
   * 
   * @param blockId Block ID to set as active
   */
  setActiveBlock(blockId: string): void {
    if (this.blocks.has(blockId)) {
      this.activeBlockId = blockId;
      
    }
  }
  
  /**
   * Associate block with a UI segment
   * 
   * @param blockId Block ID
   * @param segmentId Segment ID
   */
  setBlockSegment(blockId: string, segmentId: string): void {
    const block = this.blocks.get(blockId);
    if (block) {
      block.segmentId = segmentId;
      
    }
  }
  
  /**
   * Get a block by ID
   * 
   * @param blockId Block ID
   * @returns The block or null if not found
   */
  getBlock(blockId: string): Block | null {
    return this.blocks.get(blockId) || null;
  }
  
  /**
   * Get all blocks
   * 
   * @returns Array of all blocks
   */
  getAllBlocks(): Block[] {
    return Array.from(this.blocks.values());
  }
  
  /**
   * Get active blocks
   * 
   * @returns Array of incomplete blocks
   */
  getActiveBlocks(): Block[] {
    return Array.from(this.blocks.values()).filter(block => !block.isComplete);
  }
  
  /**
   * Reset manager state
   */
  reset(): void {
    this.blocks.clear();
    this.activeBlockId = null;
    this.nextBlockId = 1;
    

  }
}