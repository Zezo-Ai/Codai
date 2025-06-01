import { ContentProcessor } from './ContentProcessor';
import { PATTERNS } from '../patterns';

export type CodeBlockSegment = {
  type: 'code' | 'text';
  content: string;
  metadata?: {
    language?: string;
    title?: string;
  };
};

/**
 * Processor for handling code blocks in content
 */
export class CodeBlockProcessor extends ContentProcessor<CodeBlockSegment[]> {
  /**
   * Check if this processor can handle the provided content
   * @param content The content to check
   * @returns True if content contains code blocks
   */
  canProcess(content: string): boolean {
    return PATTERNS.CODE_BLOCK.test(content);
  }
  
  /**
   * Process the content and extract code blocks
   * @param content The content to process
   * @returns Array of text and code segments
   */
  process(content: string): CodeBlockSegment[] {
    if (this.isEmpty(content)) {
      return [{
        type: 'text',
        content: ''
      }];
    }
    
    const cleanedContent = this.cleanContent(content);
    const parts: CodeBlockSegment[] = [];
    let lastIndex = 0;
    
    // Reset the regex before using it
    PATTERNS.CODE_BLOCK.lastIndex = 0;
    
    let match;
    while ((match = PATTERNS.CODE_BLOCK.exec(cleanedContent)) !== null) {
      // Add text before code block if it exists
      if (match.index > lastIndex) {
        const textBefore = cleanedContent.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({
            type: 'text',
            content: textBefore
          });
        }
      }
      
      // Extract code content from the match
      const codeContent = match[2] || '';
      const language = match[1] || this.detectLanguage(codeContent);
      
      // Add code block
      parts.push({
        type: 'code',
        content: codeContent,
        metadata: {
          language
        }
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text if it exists
    if (lastIndex < cleanedContent.length) {
      const remainingText = cleanedContent.slice(lastIndex).trim();
      if (remainingText) {
        parts.push({
          type: 'text',
          content: remainingText
        });
      }
    }
    
    return parts;
  }
  
  /**
   * Detect programming language from code content
   * @param code The code content to analyze
   * @returns The detected language or 'text' if unknown
   */
  private detectLanguage(code: string): string {
    if (!code) return 'text';
    
    // Python detection
    if (
      code.includes('def ') || 
      code.includes('import ') && !code.includes('from \'') ||
      code.includes('if __name__') || 
      code.includes('print(')
    ) {
      return 'python';
    }
    
    // JavaScript/TypeScript detection
    if (
      code.includes('function ') || 
      code.includes('const ') || 
      code.includes('let ') ||
      code.includes('=>')
    ) {
      if (
        code.includes('interface ') || 
        code.includes('type ') ||
        code.includes(':') && code.includes(';')
      ) {
        return 'typescript';
      }
      return 'javascript';
    }
    
    // HTML detection
    if (
      code.includes('<html') ||
      code.includes('<!DOCTYPE') ||
      (code.includes('<div') && code.includes('</div>'))
    ) {
      return 'html';
    }
    
    // CSS detection
    if (
      code.includes('{') && 
      code.includes('}') &&
      code.includes(':') &&
      !code.includes('function')
    ) {
      if (code.includes('@import') || code.includes('@media')) {
        return 'css';
      }
    }
    
    // JSON detection
    if (
      code.trim().startsWith('{') && 
      code.trim().endsWith('}') &&
      code.includes('"') && 
      code.includes(':')
    ) {
      try {
        JSON.parse(code);
        return 'json';
      } catch {
        // Not valid JSON
      }
    }
    
    // SQL detection
    if (
      code.toUpperCase().includes('SELECT ') && 
      code.toUpperCase().includes('FROM ')
    ) {
      return 'sql';
    }
    
    // Fallback to text
    return 'text';
  }
}