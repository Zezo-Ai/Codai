/**
 * Content Formatter
 * 
 * Formats different types of content for display.
 * Focused solely on formatting without state management or parsing.
 */

import { Logger } from './Logger';
import { ContentType } from './types';

/**
 * Configuration for the content formatter
 */
export interface FormatterConfig {
  debug?: boolean;
  enableMarkdown?: boolean;
  enableSyntaxHighlight?: boolean;
}

/**
 * Formatter for message content
 */
export class ContentFormatter {
  private logger: Logger;
  private config: FormatterConfig;

  /**
   * Create a new content formatter
   */
  constructor(config: FormatterConfig = {}) {
    this.config = {
      debug: false,
      enableMarkdown: true,
      enableSyntaxHighlight: true,
      ...config
    };
    
    this.logger = new Logger({
      level: this.config.debug ? 'debug' : 'info',
      enabled: this.config.debug
    });
  }

  /**
   * Format content based on its type
   */
  format(content: string, type: ContentType, metadata?: Record<string, any>): string {
    if (!content) return '';
    
    this.logger.debug('formatter', `Formatting content type: ${type}`, { contentLength: content.length });
    
    switch (type) {
      case 'code':
        return this.formatCode(content, metadata);
      case 'tool_call':
        return this.formatToolCall(content, metadata);
      case 'tool_result':
        return this.formatToolResult(content, metadata);
      case 'table':
        return this.formatTable(content, metadata);
      case 'image':
        return this.formatImage(content, metadata);
      case 'file':
        return this.formatFile(content, metadata);
      case 'error':
        return this.formatError(content, metadata);
      case 'warning':
        return this.formatWarning(content, metadata);
      case 'thinking':
        return this.formatThinking(content, metadata);
      case 'system':
        return this.formatSystem(content, metadata);
      case 'text':
      default:
        return this.formatText(content, metadata);
    }
  }

  /**
   * Format regular text content
   */
  private formatText(content: string, metadata?: Record<string, any>): string {
    // Apply basic formatting
    let formatted = content.trim();
    
    // Handle basic markdown if enabled
    if (this.config.enableMarkdown) {
      // Replace code blocks
      formatted = formatted.replace(/```([a-z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return this.formatCodeBlock(code, lang);
      });
      
      // Replace inline code
      formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
      
      // Replace bold text
      formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      
      // Replace italic text
      formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      
      // Replace line breaks
      formatted = formatted.replace(/\n\n/g, '</p><p>');
      formatted = formatted.replace(/\n/g, '<br>');
      
      // Wrap in paragraphs if needed
      if (!formatted.startsWith('<')) {
        formatted = `<p>${formatted}</p>`;
      }
    }
    
    return formatted;
  }

  /**
   * Format code content
   */
  private formatCode(content: string, metadata?: Record<string, any>): string {
    const language = metadata?.language || '';
    return this.formatCodeBlock(content, language);
  }

  /**
   * Format a code block with syntax highlighting
   */
  private formatCodeBlock(code: string, language: string): string {
    // Basic code block formatting
    return `<pre><code class="language-${language}">${code}</code></pre>`;
  }

  /**
   * Format tool call content
   */
  private formatToolCall(content: string, metadata?: Record<string, any>): string {
    try {
      // If content is a string representation of JSON, parse it
      let toolData = content;
      if (typeof content === 'string' && content.trim().startsWith('{')) {
        try {
          toolData = JSON.parse(content);
        } catch (e) {
          // If parsing fails, use the original content
          this.logger.warn('formatter', 'Failed to parse tool call JSON', e);
        }
      }
      
      // Get tool name and details
      const toolName = metadata?.name || toolData?.name || 'unknown';
      const toolId = metadata?.id || toolData?.id || '';
      
      // Format as HTML
      let html = `
        <div class="tool-call">
          <div class="tool-call-header">
            <span class="tool-call-icon">🔧</span>
            <span class="tool-call-name">${toolName}</span>
            ${toolId ? `<span class="tool-call-id">(${toolId})</span>` : ''}
          </div>
          <div class="tool-call-content">`;
      
      // Format arguments
      if (toolData?.arguments) {
        html += `<div class="tool-call-args">`;
        
        // If arguments is a string, display it directly
        if (typeof toolData.arguments === 'string') {
          html += `<pre>${toolData.arguments}</pre>`;
        } 
        // Otherwise, format as key-value pairs
        else {
          Object.entries(toolData.arguments).forEach(([key, value]) => {
            html += `<div class="arg-item">
              <span class="arg-name">${key}:</span> 
              <span class="arg-value">${JSON.stringify(value)}</span>
            </div>`;
          });
        }
        
        html += `</div>`;
      }
      
      html += `
          </div>
        </div>`;
      
      return html;
    } catch (error) {
      this.logger.error('formatter', 'Error formatting tool call', error);
      return `<div class="tool-call tool-call-error">
        <div class="tool-call-header">
          <span class="tool-call-icon">⚠️</span>
          <span class="tool-call-name">Tool Call (Error)</span>
        </div>
        <div class="tool-call-content">
          <pre>${content}</pre>
        </div>
      </div>`;
    }
  }

  /**
   * Format tool result content
   */
  private formatToolResult(content: string, metadata?: Record<string, any>): string {
    try {
      const toolCallId = metadata?.toolCallId || '';
      const type = metadata?.type || 'default';
      
      // Choose icon based on metadata type
      let icon = '🔍';
      let title = 'Tool Result';
      
      if (type === 'file') {
        icon = '📄';
        title = 'File Content';
      } else if (type === 'directory') {
        icon = '📂';
        title = 'Directory Listing';
      } else if (type === 'search') {
        icon = '🌐';
        title = 'Search Result';
      }
      
      // Format the content - ensure it's contained in a single consistent pre block
      // This prevents issues with content escaping its styled container
      // First, clean the content to ensure it doesn't have unclosed HTML tags
      let safeContent = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      return `
        <div class="tool-result">
          <div class="tool-result-header">
            <span class="tool-result-icon">${icon}</span>
            <span class="tool-result-title">${title}</span>
            ${toolCallId ? `<span class="tool-result-id">(${toolCallId})</span>` : ''}
          </div>
          <div class="tool-result-content">
            <pre>${safeContent}</pre>
          </div>
        </div>`;
    } catch (error) {
      this.logger.error('formatter', 'Error formatting tool result', error);
      return `<div class="tool-result tool-result-error">
        <div class="tool-result-header">
          <span class="tool-result-icon">⚠️</span>
          <span class="tool-result-title">Tool Result (Error)</span>
        </div>
        <div class="tool-result-content">
          <pre>${content}</pre>
        </div>
      </div>`;
    }
  }

  /**
   * Format table content
   */
  private formatTable(content: string, metadata?: Record<string, any>): string {
    try {
      // Detect markdown tables
      if (content.includes('|') && content.includes('---')) {
        return this.formatMarkdownTable(content);
      }
      
      // Fallback for non-markdown tables
      return `<div class="table-container"><pre>${content}</pre></div>`;
    } catch (error) {
      this.logger.error('formatter', 'Error formatting table', error);
      return `<pre>${content}</pre>`;
    }
  }

  /**
   * Format a markdown table
   */
  private formatMarkdownTable(markdownTable: string): string {
    try {
      const lines = markdownTable.split('\\n').filter(line => line.trim());
      if (lines.length < 3) return `<pre>${markdownTable}</pre>`;
      
      // Find the separator line (contains | and ---)
      const separatorIndex = lines.findIndex(line => 
        line.includes('|') && line.includes('---')
      );
      
      if (separatorIndex <= 0 || separatorIndex >= lines.length - 1) {
        return `<pre>${markdownTable}</pre>`;
      }
      
      // Parse header and rows
      const headerLine = lines[separatorIndex - 1];
      const headers = headerLine.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);
      
      // Generate HTML table
      let html = '<div class="table-container"><table>';
      
      // Add header
      html += '<thead><tr>';
      headers.forEach(header => {
        html += `<th>${header}</th>`;
      });
      html += '</tr></thead>';
      
      // Add rows
      html += '<tbody>';
      for (let i = separatorIndex + 1; i < lines.length; i++) {
        const rowCells = lines[i].split('|')
          .map(cell => cell.trim())
          .filter((cell, index) => index > 0 && index <= headers.length);
        
        if (rowCells.length > 0) {
          html += '<tr>';
          rowCells.forEach(cell => {
            html += `<td>${cell}</td>`;
          });
          html += '</tr>';
        }
      }
      
      html += '</tbody></table></div>';
      return html;
    } catch (error) {
      this.logger.error('formatter', 'Error formatting markdown table', error);
      return `<pre>${markdownTable}</pre>`;
    }
  }

  /**
   * Format image content
   */
  private formatImage(content: string, metadata?: Record<string, any>): string {
    const imageUrl = metadata?.url || content;
    const alt = metadata?.alt || 'Image';
    
    return `<div class="image-container">
      <img src="${imageUrl}" alt="${alt}" />
    </div>`;
  }

  /**
   * Format file content
   */
  private formatFile(content: string, metadata?: Record<string, any>): string {
    return `<div class="file-container">
      <div class="file-header">
        <span class="file-icon">📄</span>
        <span class="file-name">${metadata?.filename || 'File'}</span>
      </div>
      <pre class="file-content">${content}</pre>
    </div>`;
  }

  /**
   * Format error content
   */
  private formatError(content: string, metadata?: Record<string, any>): string {
    return `<div class="error-message">
      <span class="error-icon">⚠️</span>
      <div class="error-content">${content}</div>
    </div>`;
  }

  /**
   * Format warning content
   */
  private formatWarning(content: string, metadata?: Record<string, any>): string {
    return `<div class="warning-message">
      <span class="warning-icon">⚠️</span>
      <div class="warning-content">${content}</div>
    </div>`;
  }

  /**
   * Format thinking content
   */
  private formatThinking(content: string, metadata?: Record<string, any>): string {
    return `<div class="thinking-content">
      <span class="thinking-icon">💭</span>
      <div class="thinking-text">${content}</div>
    </div>`;
  }

  /**
   * Format system message content
   */
  private formatSystem(content: string, metadata?: Record<string, any>): string {
    return `<div class="system-message">
      <span class="system-icon">🔄</span>
      <div class="system-content">${content}</div>
    </div>`;
  }
}