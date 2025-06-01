/**
 * Block Formatters - Layer 3: Type-Specific Formatting & Styling
 * 
 * Formats and styles blocks based on their type.
 * This implements Layer 3 of the Three-Layer Content Processing Architecture:
 * - Applies appropriate styling based on block type
 * - Renders specialized UI components for different block types
 * - Handles interactive elements within blocks
 */

import React from 'react';
import { ProcessedBlock } from '../../lib/blockProcessor';

/**
 * Base interface for all block formatters
 */
export interface BlockFormatter {
  canFormat(blockType: string): boolean;
  format(block: ProcessedBlock): React.ReactNode;
  priority: number;
}

/**
 * Registry for all block formatters
 */
export class FormatterRegistry {
  private formatters: BlockFormatter[] = [];
  
  constructor() {
    // Register default formatters
    this.registerDefaults();
  }
  
  private registerDefaults() {
    this.register(new TextFormatter());
    this.register(new ToolCallFormatter());
    this.register(new ToolResultFormatter());
    // Additional formatters can be registered here
  }
  
  register(formatter: BlockFormatter): void {
    this.formatters.push(formatter);
    // Sort by priority (higher numbers come first)
    this.formatters.sort((a, b) => b.priority - a.priority);
  }
  
  getFormatter(blockType: string): BlockFormatter | null {
    return this.formatters.find(f => f.canFormat(blockType)) || null;
  }
  
  formatBlock(block: ProcessedBlock): React.ReactNode {
    const formatter = this.getFormatter(block.type);
    if (!formatter) {
      console.warn(`No formatter found for block type: ${block.type}`);
      return <div className="p-3 border rounded bg-gray-50">{block.content}</div>;
    }
    
    return formatter.format(block);
  }
}

/**
 * Formatter for plain text blocks
 */
export class TextFormatter implements BlockFormatter {
  priority = 1; // Lowest priority (fallback)
  
  canFormat(blockType: string): boolean {
    return blockType === 'text';
  }
  
  format(block: ProcessedBlock): React.ReactNode {
    return (
      <div className="whitespace-pre-wrap">
        {block.content}
      </div>
    );
  }
}

/**
 * Formatter for tool call blocks
 */
export class ToolCallFormatter implements BlockFormatter {
  priority = 30;
  
  canFormat(blockType: string): boolean {
    return blockType === 'tool_call';
  }
  
  format(block: ProcessedBlock): React.ReactNode {
    // Format tool call - typically a JSON object
    return (
      <div className="bg-blue-50 p-2 rounded border border-blue-200">
        <div className="text-xs text-blue-500 font-mono mb-1">Tool Call</div>
        <pre className="text-xs whitespace-pre-wrap font-mono overflow-auto max-h-64">
          {block.content}
        </pre>
      </div>
    );
  }
}

/**
 * Formatter for tool result blocks
 */
export class ToolResultFormatter implements BlockFormatter {
  priority = 30;
  
  canFormat(blockType: string): boolean {
    return blockType === 'tool_result';
  }
  
  format(block: ProcessedBlock): React.ReactNode {
    // Detect directory listing
    if (block.metadata?.resultType === 'directory_listing' || 
        block.content.includes('Contents of directory:')) {
      return this.formatDirectoryListing(block);
    }
    
    // Detect file view
    if (block.metadata?.resultType === 'file_view' || 
        block.content.includes('🔍 View File')) {
      return this.formatFileView(block);
    }
    
    // Generic tool result
    return (
      <div className="bg-amber-50 p-2 rounded border border-amber-200">
        <div className="text-xs text-amber-600 font-mono mb-1">Tool Result</div>
        <div className="text-sm whitespace-pre-wrap">
          {block.content}
        </div>
      </div>
    );
  }
  
  private formatDirectoryListing(block: ProcessedBlock): React.ReactNode {
    return (
      <div className="bg-amber-50 p-2 rounded border border-amber-200">
        <div className="text-xs text-amber-600 font-mono mb-1">Directory Listing</div>
        <div className="text-sm whitespace-pre-wrap font-mono">
          {block.content}
        </div>
      </div>
    );
  }
  
  private formatFileView(block: ProcessedBlock): React.ReactNode {
    return (
      <div className="bg-amber-50 p-2 rounded border border-amber-200">
        <div className="text-xs text-amber-600 font-mono mb-1">File View</div>
        <div className="text-sm whitespace-pre-wrap font-mono">
          {block.content}
        </div>
      </div>
    );
  }
}

/**
 * Main component that renders a block using appropriate formatter
 */
export const FormattedBlock: React.FC<{
  block: ProcessedBlock;
}> = ({ block }) => {
  // Use shared formatter registry (could be singleton/context in real app)
  const registry = new FormatterRegistry();
  
  return (
    <div className="border rounded shadow-sm overflow-hidden mb-2">
      <div className="flex justify-between items-center bg-gray-100 px-3 py-1">
        <div className="flex items-center">
          <span className="inline-flex items-center justify-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium mr-2">
            {block.number}
          </span>
          <span className="font-mono text-xs text-gray-600">
            {block.type}
          </span>
        </div>
        <span className="text-xs text-gray-500 capitalize">
          {block.state.toLowerCase()}
        </span>
      </div>
      <div className="p-3 bg-white">
        {registry.formatBlock(block)}
      </div>
    </div>
  );
};

/**
 * Component that renders a list of blocks
 */
export const FormattedBlocks: React.FC<{
  blocks: ProcessedBlock[];
}> = ({ blocks }) => {
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => (
        <FormattedBlock key={index} block={block} />
      ))}
    </div>
  );
};