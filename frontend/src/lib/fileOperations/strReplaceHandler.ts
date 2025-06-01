/**
 * String Replace Handler
 * 
 * Provides utilities for handling file editing operations using string replacement.
 * Extracted from streamStates.ts to modularize the codebase.
 */

// Content patterns for DOM updates
const NEW_CONTENT_PATTERN = /<div class="action-diff-new">[\s\S]*?<pre class="action-diff-content">[\s\S]*?<\/pre>/;
const PREVIEW_PATTERN = /<pre class="action-preview-content">.*?<\/pre>/s;
const STATUS_PATTERN = /<span class="action-status">[^<]*<\/span>/;
const HEADER_PATTERN = /<div class="action-preview-header">.*?<\/div>/;

/**
 * Process escape sequences in a string
 * @param str String that may contain escape sequences
 * @returns Processed string with escape sequences converted
 */
function processEscapeSequences(str: string): string {
  try {
    return JSON.parse(`"${str.replace(/"/g, '\\"')}"`);
  } catch {
    // Fallback to manual replacement if JSON parsing fails
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
}

/**
 * Update content using a pattern replacement
 * @param content Original content
 * @param pattern RegExp pattern to match
 * @param replacement Replacement string
 * @returns Updated content
 */
function updateContentWithPattern(content: string, pattern: RegExp, replacement: string): string {
  if (pattern.test(content)) {
    return content.replace(pattern, replacement);
  }
  return content;
}

/**
 * Extracts a string property using more efficient substring operations
 * @param actionBuffer Buffer to search in
 * @param propertyName Name of the property to extract (e.g., "old_str")
 * @returns The extracted string or null if not found
 */
function extractStringProperty(actionBuffer: string, propertyName: string): string | null {
  // Check if property exists in buffer
  const propIndex = actionBuffer.indexOf(`"${propertyName}"`);
  if (propIndex === -1) return null;
  
  // Find opening quote position
  const colonPos = actionBuffer.indexOf(':', propIndex);
  if (colonPos === -1) return null;
  
  const quotePos = actionBuffer.indexOf('"', colonPos);
  if (quotePos === -1) return null;
  
  // Find closing quote position (handling escaped quotes)
  let closeQuotePos = -1;
  let searchPos = quotePos + 1;
  
  while (searchPos < actionBuffer.length) {
    if (actionBuffer[searchPos] === '"' && actionBuffer[searchPos-1] !== '\\') {
      closeQuotePos = searchPos;
      break;
    }
    searchPos++;
  }
  
  // Extract value if both quotes found
  if (closeQuotePos !== -1) {
    return actionBuffer.substring(quotePos + 1, closeQuotePos);
  }
  
  return null;
}

/**
 * Process a str_replace operation from the buffer
 * 
 * @param actionBuffer The current action buffer containing the str_replace operation
 * @param containerContent The current container content HTML
 * @param actionData Structured data about the action
 * @returns Object containing processed data and UI updates
 */
export function processStrReplace(
  actionBuffer: string,
  containerContent: string,
  actionData: any
): {
  containerContent: string;
  contentUpdated: boolean;
  actionData: any;
} {
  // Always make a fresh copy of action data to preserve all properties
  let updatedActionData = { ...actionData };
  let updatedContent = containerContent;
  let contentUpdated = false;
  
  // Extract old_str and new_str without using regex
  const oldStr = extractStringProperty(actionBuffer, "old_str");
  const newStr = extractStringProperty(actionBuffer, "new_str");
  
  // Check for path using indexed operations rather than regex
  // Note: Path should now be handled by the main detection system
  // This is just a fallback to ensure compatibility
  if (!updatedActionData.path || !updatedActionData.isPathComplete) {
    const path = extractStringProperty(actionBuffer, "path");
    if (path) {
      updatedActionData.path = path;
      updatedActionData.isPathComplete = true;
      
      // Path updates should now be handled by the main class
      // No DOM updates for path here to avoid duplications
    }
  }
  
  // Early return if no old_str matched
  if (!oldStr) {
    return {
      containerContent: updatedContent,
      contentUpdated: contentUpdated,
      actionData: updatedActionData
    };
  }
  
  // CASE 1: We have both old_str and new_str - show complete diff
  if (oldStr && newStr) {
    const haveNewData = 
      !updatedActionData.old_str || 
      !updatedActionData.new_str ||
      oldStr.length > (updatedActionData.old_str?.length || 0) ||
      newStr.length > (updatedActionData.new_str?.length || 0);
      
    if (haveNewData) {
      // Update our structured data
      updatedActionData.old_str = oldStr;
      updatedActionData.new_str = newStr;
      updatedActionData.isContentStarted = true;
      
      // Process escape sequences for both strings
      const processedOldText = processEscapeSequences(oldStr);
      const processedNewText = processEscapeSequences(newStr);
      
      // Prepare diff view HTML
      const diffHtml = generateStrReplaceDiffHtml(processedOldText, processedNewText);
      
      // Check if we already have a diff view with simple string check
      const hasDiffView = updatedContent.indexOf('action-diff-new') !== -1;
      
      if (hasDiffView) {
        // If diff view exists, just update the new content part
        const newContentStart = updatedContent.indexOf('<div class="action-diff-new">');
        if (newContentStart !== -1) {
          const newContentEnd = updatedContent.indexOf('</div>', newContentStart);
          if (newContentEnd !== -1) {
            const nextDivEnd = updatedContent.indexOf('</div>', newContentEnd + 6);
            if (nextDivEnd !== -1) {
              // Replace just the modified content section
              updatedContent = 
                updatedContent.substring(0, newContentStart) +
                `<div class="action-diff-new">
                  <div class="action-diff-header">Modified</div>
                  <pre class="action-diff-content">${processedNewText}</pre>
                </div>` +
                updatedContent.substring(nextDivEnd + 6);
            }
          }
        }
      } else {
        // If no diff view exists yet, create one using simple string replacement
        const previewStart = updatedContent.indexOf('<pre class="action-preview-content">');
        if (previewStart !== -1) {
          const previewEnd = updatedContent.indexOf('</pre>', previewStart);
          if (previewEnd !== -1) {
            updatedContent = 
              updatedContent.substring(0, previewStart) +
              diffHtml +
              updatedContent.substring(previewEnd + 6);
          }
        }
      }
      
      // Path is used to identify the current component (if provided)
      if (updatedActionData.path) {
        // Find the component containing this path to scope the update
        const pathPattern = `<span class="detected-path">${updatedActionData.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`;
        const pathIndex = updatedContent.indexOf(pathPattern);
        
        if (pathIndex !== -1) {
          // Find the surrounding component
          const componentStartIndex = updatedContent.lastIndexOf('<span', pathIndex);
          const componentEndIndex = updatedContent.indexOf('</span></span></span>', componentStartIndex);
          
          if (componentStartIndex !== -1 && componentEndIndex !== -1) {
            // Extract just this component's HTML
            const componentHTML = updatedContent.substring(componentStartIndex, componentEndIndex);
            
            // Find the status within this component's HTML
            const statusRelativeIndex = componentHTML.indexOf('<span class="action-status">');
            if (statusRelativeIndex !== -1) {
              // Calculate absolute index in the container
              const statusIndex = componentStartIndex + statusRelativeIndex;
              const statusEndIndex = updatedContent.indexOf('</span>', statusIndex);
              
              if (statusEndIndex !== -1) {
                // Update only this component's status
                updatedContent = 
                  updatedContent.substring(0, statusIndex + 29) + 
                  'Both original and modified content collected' + 
                  updatedContent.substring(statusEndIndex);
              }
            }
          }
        }
      }
      
      // Update header in the same component we updated the status
      if (updatedActionData.path) {
        // Use the same component we found earlier
        const pathPattern = `<span class="detected-path">${updatedActionData.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`;
        const pathIndex = updatedContent.indexOf(pathPattern);
        
        if (pathIndex !== -1) {
          // Find the surrounding component
          const componentStartIndex = updatedContent.lastIndexOf('<span', pathIndex);
          const componentEndIndex = updatedContent.indexOf('</span></span></span>', componentStartIndex);
          
          if (componentStartIndex !== -1 && componentEndIndex !== -1) {
            // Extract just this component's HTML
            const componentHTML = updatedContent.substring(componentStartIndex, componentEndIndex);
            
            // Find the header within this component's HTML
            const headerRelativeIndex = componentHTML.indexOf('<div class="action-preview-header">');
            if (headerRelativeIndex !== -1) {
              // Calculate absolute index in the container
              const headerIndex = componentStartIndex + headerRelativeIndex;
              const headerEndIndex = updatedContent.indexOf('</div>', headerIndex);
              
              if (headerEndIndex !== -1) {
                // Update only this component's header
                updatedContent = 
                  updatedContent.substring(0, headerIndex + 35) + 
                  'Complete Changes:' + 
                  updatedContent.substring(headerEndIndex);
              }
            }
          }
        }
      }
      
      contentUpdated = true;
    }
  }
  // CASE 2: We have only old_str - show partial update
  else if (oldStr && (!updatedActionData.old_str || oldStr.length > updatedActionData.old_str.length)) {
    // Update our structured data
    updatedActionData.old_str = oldStr;
    updatedActionData.isContentStarted = true;
    
    // Process escape sequences for old text
    const processedOldText = processEscapeSequences(oldStr);
    
    // Show original content in the preview area
    const previewHtml = `<pre class="action-preview-content">Original Content: ${processedOldText}</pre>`;
    
    // Update the preview content using string operations instead of regex
    const previewStart = updatedContent.indexOf('<pre class="action-preview-content">');
    if (previewStart !== -1) {
      const previewEnd = updatedContent.indexOf('</pre>', previewStart);
      if (previewEnd !== -1) {
        updatedContent = 
          updatedContent.substring(0, previewStart) +
          previewHtml.substring(0, previewHtml.length - 6) +
          updatedContent.substring(previewEnd);
      }
    }
    
    // Path is used to identify the current component (if provided)
    if (updatedActionData.path) {
      // Find the component containing this path to scope the update
      const pathPattern = `<span class="detected-path">${updatedActionData.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`;
      const pathIndex = updatedContent.indexOf(pathPattern);
      
      if (pathIndex !== -1) {
        // Find the surrounding component
        const componentStartIndex = updatedContent.lastIndexOf('<span', pathIndex);
        const componentEndIndex = updatedContent.indexOf('</span></span></span>', componentStartIndex);
        
        if (componentStartIndex !== -1 && componentEndIndex !== -1) {
          // Extract just this component's HTML
          const componentHTML = updatedContent.substring(componentStartIndex, componentEndIndex);
          
          // Find the status within this component's HTML
          const statusRelativeIndex = componentHTML.indexOf('<span class="action-status">');
          if (statusRelativeIndex !== -1) {
            // Calculate absolute index in the container
            const statusIndex = componentStartIndex + statusRelativeIndex;
            const statusEndIndex = updatedContent.indexOf('</span>', statusIndex);
            
            if (statusEndIndex !== -1) {
              // Update only this component's status
              updatedContent = 
                updatedContent.substring(0, statusIndex + 29) + 
                'Original content collected, waiting for changes...' + 
                updatedContent.substring(statusEndIndex);
            }
          }
        }
      }
    }
    
    // Update header in the same component we updated the status
    if (updatedActionData.path) {
      const pathPattern = `<span class="detected-path">${updatedActionData.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`;
      const pathIndex = updatedContent.indexOf(pathPattern);
      
      if (pathIndex !== -1) {
        // Find the surrounding component
        const componentStartIndex = updatedContent.lastIndexOf('<span', pathIndex);
        const componentEndIndex = updatedContent.indexOf('</span></span></span>', componentStartIndex);
        
        if (componentStartIndex !== -1 && componentEndIndex !== -1) {
          // Extract just this component's HTML
          const componentHTML = updatedContent.substring(componentStartIndex, componentEndIndex);
          
          // Find the header within this component's HTML
          const headerRelativeIndex = componentHTML.indexOf('<div class="action-preview-header">');
          if (headerRelativeIndex !== -1) {
            // Calculate absolute index in the container
            const headerIndex = componentStartIndex + headerRelativeIndex;
            const headerEndIndex = updatedContent.indexOf('</div>', headerIndex);
            
            if (headerEndIndex !== -1) {
              // Update only this component's header
              updatedContent = 
                updatedContent.substring(0, headerIndex + 35) + 
                'Original Content Collected:' + 
                updatedContent.substring(headerEndIndex);
            }
          }
        }
      }
    }
    
    contentUpdated = true;
  }
  
  return {
    containerContent: updatedContent,
    contentUpdated,
    actionData: updatedActionData
  };
}

/**
 * Calculate progress percentage for a str_replace operation
 * 
 * @param actionBuffer The current action buffer
 * @param oldStr The original string
 * @param newStr The replacement string
 * @returns Progress percentage (0-100)
 */
export function calculateStrReplaceProgress(
  actionBuffer: string,
  oldStr: string,
  newStr: string
): number {
  // Calculate progress based on buffer size relative to content size
  return Math.min(100, Math.round((actionBuffer.length / (oldStr.length + newStr.length)) * 100));
}

/**
 * Generate HTML preview for a str_replace action
 * 
 * @param oldStr The original string content
 * @param newStr The new string content 
 * @returns HTML for the diff view
 */
export function generateStrReplaceDiffHtml(oldStr: string, newStr: string): string {
  return [
    '<div class="action-diff">',
    '  <div class="action-diff-old">',
    '    <div class="action-diff-header">Original</div>',
    `    <pre class="action-diff-content">${oldStr}</pre>`,
    '  </div>',
    '  <div class="action-diff-new">',
    '    <div class="action-diff-header">Modified</div>',
    `    <pre class="action-diff-content">${newStr}</pre>`,
    '  </div>',
    '</div>'
  ].join('\n');
}