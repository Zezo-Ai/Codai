import { ContentProcessor } from './ContentProcessor';
import { PATTERNS } from '../patterns';

export type ActionType = 
  | 'key'
  | 'type'
  | 'mouse_move'
  | 'left_click'
  | 'right_click'
  | 'middle_click'
  | 'double_click'
  | 'left_click_drag'
  | 'screenshot'
  | 'cursor_position'
  | 'web_search'
  | 'web_fetch';

export type CommandType = 
  | 'view' 
  | 'edit' 
  | 'create' 
  | 'delete' 
  | 'execute';

export type OperationType = 
  | 'create' 
  | 'delete' 
  | 'move' 
  | 'copy' 
  | 'rename';

export interface ActionCommand {
  action?: ActionType;
  command?: CommandType;
  operation?: OperationType;
  text?: string;
  path?: string;
  coordinate?: [number, number];
  query?: string;
  file_text?: string;
  rawContent: string;
  metadata?: Record<string, any>;
}

export type ActionSegment = {
  type: 'action' | 'text';
  content: string;
  action?: ActionCommand;
};

/**
 * Processor for handling action commands in content
 */
export class ActionCommandProcessor extends ContentProcessor<ActionSegment[]> {
  /**
   * Check if this processor can handle the provided content
   * @param content The content to check
   * @returns True if content contains action commands
   */
  canProcess(content: string): boolean {
    // Use the regex approach
    if (PATTERNS.ACTION_COMMAND.test(content)) {
      return true;
    }
    
    // For more complex cases, try to find and parse JSON objects
    const jsonPattern = /\{[^{}]*\}/g;
    const potentialJsonMatches = Array.from(content.matchAll(jsonPattern));
    
    for (const match of potentialJsonMatches) {
      try {
        const jsonObj = JSON.parse(match[0]);
        if (jsonObj.action || jsonObj.command || jsonObj.operation || 
            (jsonObj.query && typeof jsonObj.query === 'string')) {
          return true;
        }
      } catch (e) {
        // Not valid JSON, continue checking
      }
    }
    
    return false;
  }
  
  /**
   * Process the content and extract action commands
   * @param content The content to process
   * @returns Array of text and action segments
   */
  process(content: string): ActionSegment[] {
    if (this.isEmpty(content)) {
      return [{
        type: 'text',
        content: ''
      }];
    }
    
    // First, handle numbered commands
    const processedContent = this.processNumberedCommands(content);
    const parts: ActionSegment[] = [];
    let lastIndex = 0;
    
    // Reset the regex before using it
    PATTERNS.ACTION_COMMAND.lastIndex = 0;
    
    const matches = Array.from(processedContent.matchAll(PATTERNS.ACTION_COMMAND));
    
    for (const match of matches) {
      if (!match.index) continue;
      
      // Add text before action if it exists
      if (match.index > lastIndex) {
        const textBefore = processedContent.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({
            type: 'text',
            content: textBefore
          });
        }
      }
      
      // Parse the action JSON
      try {
        const actionContent = match[1];
        const actionObj = JSON.parse(actionContent) as ActionCommand;
        
        // Add the raw content to the action object
        actionObj.rawContent = actionContent;
        
        parts.push({
          type: 'action',
          content: actionContent,
          action: actionObj
        });
      } catch (e) {
        // If parsing fails, treat as regular text
        parts.push({
          type: 'text',
          content: match[0]
        });
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text if it exists
    if (lastIndex < processedContent.length) {
      const remainingText = processedContent.slice(lastIndex).trim();
      if (remainingText) {
        parts.push({
          type: 'text',
          content: remainingText
        });
      }
    }
    
    // If no parts were created, return the original content
    if (parts.length === 0) {
      return [{
        type: 'text',
        content: processedContent
      }];
    }
    
    return parts;
  }
  
  /**
   * Pre-processes numbered commands to format them properly
   * @param content Content with potential numbered commands
   * @returns Processed content with reformatted commands
   */
  private processNumberedCommands(content: string): string {
    return content.replace(
      PATTERNS.NUMBERED_COMMAND,
      (match, prefix, json) => {
        try {
          // Verify JSON is valid and contains command
          const parsed = JSON.parse(json);
          if (parsed.command || parsed.action || parsed.operation) {
            return `${prefix.trim()}\n${json}`;
          }
        } catch (e) {}
        return match;
      }
    );
  }
}