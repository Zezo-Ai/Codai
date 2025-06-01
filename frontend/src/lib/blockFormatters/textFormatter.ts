/**
 * Text Block Formatter
 * 
 * Handles formatting of text blocks, including:
 * - Standard text formatting
 * - Markdown text formatting
 * - Handling of partial text chunks
 */

import { BlockAttributes, BlockFormatter, FormatterResult } from './types';

/**
 * Text block formatter
 * @implements {BlockFormatter}
 */
export const textFormatter: BlockFormatter = {
  /**
   * Format a text block based on its attributes
   * 
   * @param content The text content
   * @param attributes The block attributes
   * @returns Formatted HTML and metadata
   */
  format(content: string, attributes: BlockAttributes): FormatterResult {
    console.log(`📝 TEXT_FORMATTER: Formatting block [length=${content.length}, format=${attributes.format || 'standard'}]`);
    
    // Check if this is markdown-formatted text
    if (attributes.format === 'markdown') {
      const result = formatMarkdownText(content, attributes);
      console.log(`✅ TEXT_FORMATTER: Markdown formatted [html_length=${result.html.length}]`);
      return result;
    }
    
    // Otherwise, format as standard text
    const result = formatStandardText(content, attributes);
    console.log(`✅ TEXT_FORMATTER: Standard formatted [html_length=${result.html.length}]`);
    return result;
  },
  
  /**
   * Check if this formatter supports the given block type
   * 
   * @param blockType The block type to check
   * @returns Whether this formatter supports the block type
   */
  supports(blockType: string): boolean {
    return blockType.toLowerCase() === 'text';
  },
  
  /**
   * Check if the text content appears to be incomplete
   * 
   * @param content The text content to check
   * @returns Whether the content appears to be incomplete
   */
  isPartialContent(content: string): boolean {
    const isPartial = isPartialTextContent(content);
    if (isPartial) {
      console.log(`⚠️ TEXT_FORMATTER: Detected partial content [length=${content.length}]`);
    }
    return isPartial;
  },
  
  /**
   * Combine partial text chunks into coherent text
   * 
   * @param previousContent The previous partial content
   * @param newContent The new content to append
   * @returns The combined content
   */
  combineContentChunks(previousContent: string, newContent: string): string {
    console.log(`🔄 TEXT_FORMATTER: Combining chunks [prev=${previousContent.length}, new=${newContent.length}]`);
    const combined = combineTextChunks(previousContent, newContent);
    return combined;
  }
};

/**
 * Format standard text (non-markdown)
 * 
 * @param content The text content
 * @param attributes The block attributes
 * @returns Formatted HTML and metadata
 */
function formatStandardText(content: string, attributes: BlockAttributes): FormatterResult {
  // Just pass through the content EXACTLY as-is - DO NOT trim or modify in any way
  // The AI provides properly formatted HTML now
  
  console.log(`📝 TEXT_FORMATTER: Passing through content with absolutely no modification`);
  
  return {
    html: `<div class="block-text-content">${content}</div>`,
    metadata: {}
  };
}

/**
 * Format markdown text
 * 
 * @param content The markdown content
 * @param attributes The block attributes
 * @returns Formatted HTML and metadata
 */
function formatMarkdownText(content: string, attributes: BlockAttributes): FormatterResult {
  // Clean up the content
  let cleanContent = content.trim();
  
  // Process markdown elements
  
  // 1. Headers - match # Header, ## Header, etc.
  cleanContent = cleanContent.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, text) => {
    const level = hashes.length;
    return `<h${level} class="md-header md-h${level}">${text.trim()}</h${level}>`;
  });
  
  // 2. Bold - match **bold** or __bold__
  cleanContent = cleanContent.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (match, p1, p2) => {
    return `<strong>${p1 || p2}</strong>`;
  });
  
  // 3. Italic - match *italic* or _italic_
  cleanContent = cleanContent.replace(/\*([^*]+)\*|_([^_]+)_/g, (match, p1, p2) => {
    return `<em>${p1 || p2}</em>`;
  });
  
  // 4. Code - match `code` - make sure to escape HTML inside code blocks
  cleanContent = cleanContent.replace(/`([^`]+)`/g, (match, code) => {
    // Explicitly escape HTML inside code blocks
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    return `<code>${escapedCode}</code>`;
  });
  
  // 5. Links - match [text](url)
  cleanContent = cleanContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  
  // 6. Unordered lists - match lines starting with -, *, or +
  const hasUnorderedList = /^[\s]*[-*+]\s+/m.test(cleanContent);
  if (hasUnorderedList) {
    // Make sure list items are on their own lines
    cleanContent = cleanContent.replace(/([^\n])(\s*[-*+]\s+)/g, '$1\n$2');
    
    // Process the list items
    cleanContent = cleanContent.replace(/^[\s]*[-*+]\s+(.+)$/gm, (match, content) => {
      return `<li>${content.trim()}</li>`;
    });
    
    // Wrap with <ul> tags if not already wrapped
    if (!cleanContent.includes('<ul>')) {
      // Find consecutive <li> elements and group them
      cleanContent = cleanContent.replace(/(<li>[\s\S]+?<\/li>[\s\n]*)+/g, (match) => {
        return `<ul>\n${match}</ul>`;
      });
    }
  }
  
  // 7. Ordered lists - match lines starting with 1., 2., etc.
  const hasOrderedList = /^[\s]*\d+\.\s+/m.test(cleanContent);
  if (hasOrderedList) {
    // Make sure list items are on their own lines
    cleanContent = cleanContent.replace(/([^\n])(\s*\d+\.\s+)/g, '$1\n$2');
    
    // Process the list items
    cleanContent = cleanContent.replace(/^[\s]*\d+\.\s+(.+)$/gm, (match, content) => {
      return `<li>${content.trim()}</li>`;
    });
    
    // Wrap with <ol> tags if not already wrapped
    if (!cleanContent.includes('<ol>')) {
      // Find consecutive <li> elements and group them
      cleanContent = cleanContent.replace(/(<li>[\s\S]+?<\/li>[\s\n]*)+/g, (match) => {
        return `<ol>\n${match}</ol>`;
      });
    }
  }
  
  // 8. Horizontal rules - match ---, ***, or ___ on their own line
  cleanContent = cleanContent.replace(/^[\s]*(---|\*\*\*|___)[\s]*$/gm, '<hr>');
  
  // 9. Images - match ![alt](url)
  cleanContent = cleanContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    return `<img src="${url}" alt="${alt || ''}" class="md-image">`;
  });
  
  // 10. Blockquotes - match lines starting with >
  const hasBlockquote = /^[\s]*>[\s]*.+/m.test(cleanContent);
  if (hasBlockquote) {
    // Make sure blockquote lines are on their own lines
    cleanContent = cleanContent.replace(/([^\n])([\s]*>[\s]*)/g, '$1\n$2');
    
    // Process the blockquote content
    cleanContent = cleanContent.replace(/^[\s]*>[\s]*(.+)$/gm, (match, content) => {
      return `<blockquote>${content.trim()}</blockquote>`;
    });
    
    // Combine consecutive blockquotes
    cleanContent = cleanContent.replace(/(<blockquote>[\s\S]+?<\/blockquote>[\s\n]*)+/g, (match) => {
      return `<div class="md-blockquote">${match}</div>`;
    });
  }
  
  // Wrap the content in a div with markdown class
  return {
    html: `<div class="block-text-content md-content">${cleanContent}</div>`,
    metadata: {
      format: 'markdown',
      hasLists: hasUnorderedList || hasOrderedList,
      hasBlockquote: hasBlockquote
    }
  };
}

/**
 * Determine if text content appears to be incomplete
 * This checks for common indicators that text is part of a larger chunk
 */
export function isPartialTextContent(content: string): boolean {
  // Indicators that text might be incomplete:
  
  // 1. Ends with an incomplete word (no space or punctuation)
  const endsWithIncompleteWord = /[a-zA-Z0-9]$/.test(content);
  
  // 2. Ends with a hyphen (possible word break)
  const endsWithHyphen = content.endsWith('-');
  
  // 3. Ends with an opening markdown indicator
  const endsWithMarkdownOpener = /[*_`\[]$/.test(content) || content.endsWith('**') || content.endsWith('__');
  
  // 4. Has unbalanced markdown indicators
  const hasUnbalancedMarkdown = 
    ((content.match(/\*\*/g) || []).length % 2 !== 0) || // Bold
    ((content.match(/\*/g) || []).length % 2 !== 0) ||   // Italic with *
    ((content.match(/_/g) || []).length % 2 !== 0) ||    // Italic with _
    ((content.match(/`/g) || []).length % 2 !== 0) ||    // Code
    (content.includes('[') && !content.includes(']')) || // Link opening
    (content.includes('](') && !content.includes(')')); // Link part
  
  // 5. Ends in the middle of a list item
  const endsWithListIndicator = content.endsWith('-') || content.endsWith('*') || content.endsWith('+') || /\d+\.$/.test(content);
  
  // 6. Ends in the middle of a heading
  const endsWithHeadingIndicator = content.endsWith('#') || /#+$/.test(content) || /#+\s$/.test(content);
  
  // Return true if any of these conditions are met
  const isPartial = endsWithIncompleteWord || 
         endsWithHyphen || 
         endsWithMarkdownOpener || 
         hasUnbalancedMarkdown || 
         endsWithListIndicator || 
         endsWithHeadingIndicator;
  
  // Log the reason(s) for partial detection
  if (isPartial) {
    let reasons = [];
    if (endsWithIncompleteWord) reasons.push('incomplete word');
    if (endsWithHyphen) reasons.push('ends with hyphen');
    if (endsWithMarkdownOpener) reasons.push('markdown opener');
    if (hasUnbalancedMarkdown) reasons.push('unbalanced markdown');
    if (endsWithListIndicator) reasons.push('list indicator');
    if (endsWithHeadingIndicator) reasons.push('heading indicator');
    
    console.log(`⚠️ TEXT_FORMATTER: Partial content detected. Reasons: ${reasons.join(', ')}`);
  }
  
  return isPartial;
}

/**
 * Combine partial text chunks intelligently
 */
export function combineTextChunks(previousContent: string, newContent: string): string {
  let combinationMethod = 'direct';
  
  // 1. Handle hyphenated word breaks
  if (previousContent.endsWith('-') && /^[a-zA-Z]/.test(newContent)) {
    // Remove the hyphen and join without a space
    combinationMethod = 'hyphen-removal';
    const result = previousContent.substring(0, previousContent.length - 1) + newContent;
    console.log(`🔄 TEXT_FORMATTER: Combined chunks using ${combinationMethod} method`);
    return result;
  }
  
  // 2. Handle word breaks without hyphen (mid-word splits)
  if (/[a-zA-Z0-9]$/.test(previousContent) && /^[a-zA-Z0-9]/.test(newContent)) {
    // Join without a space
    combinationMethod = 'mid-word';
    console.log(`🔄 TEXT_FORMATTER: Combined chunks using ${combinationMethod} method`);
    return previousContent + newContent;
  }
  
  // 3. Handle incomplete markdown elements
  
  // Bold/strong separator
  if (previousContent.endsWith('*') && newContent.startsWith('*')) {
    combinationMethod = 'markdown-bold';
    console.log(`🔄 TEXT_FORMATTER: Combined chunks using ${combinationMethod} method`);
    return previousContent + newContent;
  }
  
  // Italic separator
  if ((previousContent.endsWith('_') && newContent.startsWith('_')) ||
      (previousContent.endsWith('*') && !previousContent.endsWith('**') && !newContent.startsWith('*'))) {
    combinationMethod = 'markdown-italic';
    console.log(`🔄 TEXT_FORMATTER: Combined chunks using ${combinationMethod} method`);
    return previousContent + newContent;
  }
  
  // Link separators
  if ((previousContent.endsWith('[') && !newContent.startsWith(']')) ||
      (previousContent.endsWith('](') && !newContent.startsWith(')'))) {
    combinationMethod = 'markdown-link';
    console.log(`🔄 TEXT_FORMATTER: Combined chunks using ${combinationMethod} method`);
    return previousContent + newContent;
  }
  
  // 4. Handle list item continuations
  if (/^[\s]*[-*+]\s+$/.test(previousContent) || /^[\s]*\d+\.\s+$/.test(previousContent)) {
    combinationMethod = 'list-continuation';
    console.log(`🔄 TEXT_FORMATTER: Combined chunks using ${combinationMethod} method`);
    return previousContent + newContent;
  }
  
  // 5. Handle heading continuations
  if (/#+\s+$/.test(previousContent)) {
    combinationMethod = 'heading-continuation';
    console.log(`🔄 TEXT_FORMATTER: Combined chunks using ${combinationMethod} method`);
    return previousContent + newContent;
  }
  
  // 6. Default: Add a space if the previous content doesn't end with whitespace
  // and the new content doesn't start with whitespace
  if (!/\s$/.test(previousContent) && !/^\s/.test(newContent)) {
    combinationMethod = 'space-addition';
    console.log(`🔄 TEXT_FORMATTER: Combined chunks using ${combinationMethod} method`);
    return previousContent + ' ' + newContent;
  }
  
  // Just concatenate for other cases
  console.log(`🔄 TEXT_FORMATTER: Combined chunks using direct concatenation`);
  return previousContent + newContent;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default textFormatter;