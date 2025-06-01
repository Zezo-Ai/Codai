/**
 * ContentProcessor.ts
 * 
 * Provides state-specific and block-specific content processing.
 */

import { StreamState } from './stateSegmentRenderer';

/**
 * Process content based on its state type
 * 
 * @param state The state type of the content
 * @param content The raw content to process
 * @param metadata Optional metadata about the content
 * @returns Processed content ready for display
 */
export function processStateContent(
  state: StreamState, 
  content: string,
  metadata?: Record<string, any>
): string {
  // Check if this is a block type (from metadata)
  if (metadata?.blockType) {
    return processBlockContent(metadata.blockType, content, metadata);
  }
  
  // Otherwise route to appropriate processor based on state type
  switch (state) {
    case 'INITIAL':
      return processInitialState(content);
    case 'ROLE':
      return processRoleState(content);
    case 'THINKING':
      return processThinkingState(content);
    case 'CONTENT':
      return processContentState(content);
    case 'TOKEN_UPDATE':
      return processTokenUpdateState(content);
    case 'TOOL_CALL':
      return processToolCallState(content);
    case 'TOOL_RESULT':
      return processToolResultState(content);
    case 'COMPLETION':
      return processCompletionState(content);
    case 'END':
      return processEndState(content);
    default:
      return content; // Fallback to original content
  }
}

/**
 * Process content based on block type
 * 
 * @param blockType Type of block (code, math, table, etc.)
 * @param content Raw block content
 * @param metadata Additional metadata
 * @returns Processed content for the block
 */
export function processBlockContent(
  blockType: string,
  content: string,
  metadata?: Record<string, any>
): string {
  console.log(`🧩 BLOCK_PROCESSOR: Processing ${blockType} block [length=${content.length}]`);
  console.log(`🔍 BLOCK_PROCESSOR: Content preview: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
  console.log(`📋 BLOCK_PROCESSOR: Metadata:`, metadata);
  
  // Check for block tag in content
  const hasBlockTag = content.includes('<block') || content.includes('</block>');
  console.log(`🔍 BLOCK_PROCESSOR: Contains block tags: ${hasBlockTag}`);
  
  // Check for delta type in content
  const hasDeltaType = content.includes('"delta":') && 
                       (content.includes('"type": "text"') || content.includes('"type":"text"'));
  console.log(`🔍 BLOCK_PROCESSOR: Contains delta with type=text: ${hasDeltaType}`);
  
  // Import the block formatters dynamically to avoid circular dependencies
  const { formatBlock } = require('./blockFormatters');
  
  // Check if we should preserve raw content
  const preserveRawContent = metadata?.preserveRawContent !== false;
  
  // If preserving raw content, return it unchanged
  if (preserveRawContent) {
    // Return content completely unchanged
    console.log(`⏭️ BLOCK_PROCESSOR: Preserving raw content as requested`);
    return content;
  }
  
  // Specifically log text block detection
  if (blockType.toLowerCase() === 'text') {
    console.log(`📝 BLOCK_PROCESSOR: Text block detected [format=${metadata?.format || 'standard'}]`);
    console.log(`📝 BLOCK_PROCESSOR: Will use text formatter for this content`);
  }
  
  // Try to use the new block formatters first
  try {
    console.log(`🔄 BLOCK_PROCESSOR: Calling formatBlock for type "${blockType}"`);
    const formatterResult = formatBlock(blockType, content, metadata);
    
    if (formatterResult) {
      console.log(`✅ BLOCK_PROCESSOR: Formatter successful, html length: ${formatterResult.html.length}`);
      console.log(`✅ BLOCK_PROCESSOR: Formatted HTML preview: "${formatterResult.html.substring(0, 100)}${formatterResult.html.length > 100 ? '...' : ''}"`);
      return formatterResult.html;
    } else {
      console.log(`⚠️ BLOCK_PROCESSOR: Formatter returned null result`);
    }
  } catch (e) {
    console.error('Error using block formatter:', e);
    console.log(`⚠️ BLOCK_PROCESSOR: Formatter failed with error: ${e.message}`);
    console.log(`⚠️ BLOCK_PROCESSOR: Falling back to legacy processing`);
    // Fall back to legacy processing if formatter fails
  }
  
  // Otherwise process different block types (legacy behavior as fallback)
  switch (blockType.toLowerCase()) {
    case 'code':
      return processCodeBlock(content, metadata);
    case 'math':
      return processMathBlock(content, metadata);
    case 'table':
      return processTableBlock(content, metadata);
    case 'quote':
      return processQuoteBlock(content, metadata);
    case 'warning':
      return processWarningBlock(content, metadata);
    case 'note':
      return processNoteBlock(content, metadata);
    default:
      // For unknown block types, just return the content
      console.log(`⚠️ BLOCK_PROCESSOR: Unknown block type "${blockType}", returning raw content`);
      return content;
  }
}

/**
 * Process a code block
 */
function processCodeBlock(content: string, metadata?: Record<string, any>): string {
  // Get language from metadata if available
  const language = metadata?.language || '';
  
  // Simple implementation - in a real app would use syntax highlighting
  return content;
}

/**
 * Process a math block
 */
function processMathBlock(content: string, metadata?: Record<string, any>): string {
  // In a real app, would convert to LaTeX display format
  return content;
}

/**
 * Process a table block
 */
function processTableBlock(content: string, metadata?: Record<string, any>): string {
  // In a real app, would convert to HTML table
  return content;
}

/**
 * Process a quote block
 */
function processQuoteBlock(content: string, metadata?: Record<string, any>): string {
  return content;
}

/**
 * Process a warning block
 */
function processWarningBlock(content: string, metadata?: Record<string, any>): string {
  return content;
}

/**
 * Process a note block
 */
function processNoteBlock(content: string, metadata?: Record<string, any>): string {
  return content;
}

// Other state processors (reimplemented from the original file)

/**
 * Process initial state content
 */
function processInitialState(content: string): string {
  return content;
}

/**
 * Process role state content
 */
function processRoleState(content: string): string {
  return content;
}

/**
 * Process thinking state content
 */
function processThinkingState(content: string): string {
  try {
    // Basic extraction of thinking content
    if (content.includes('"type": "thinking_chunk"')) {
      // Try to extract the thinking text
      const match = /"chunk":\s*"([^"]*)"/.exec(content);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Return original if no pattern matches
    return content;
  } catch (e) {
    return content;
  }
}

/**
 * Process content state
 */
function processContentState(content: string): string {
  console.log(`🔄 CONTENT_STATE: Processing content state [length=${content.length}]`);
  console.log(`🔍 CONTENT_STATE: Content preview: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
  
  try {
    // Extract content from delta
    if (content.includes('"delta": {')) {
      console.log(`📦 CONTENT_STATE: Detected delta content`);
      
      // Use a more robust JSON parsing approach
      try {
        // Find the JSON object
        const jsonStartIndex = content.indexOf('{');
        const jsonEndIndex = content.lastIndexOf('}') + 1;
        
        if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
          const jsonString = content.substring(jsonStartIndex, jsonEndIndex);
          console.log(`🔍 CONTENT_STATE: Attempting to parse JSON: "${jsonString.substring(0, 100)}${jsonString.length > 100 ? '...' : ''}"`);
          
          const jsonData = JSON.parse(jsonString);
          console.log(`✅ CONTENT_STATE: JSON parsed successfully`);
          
          // Check for text type in delta
          const hasTextType = jsonData.choices?.[0]?.delta?.type === 'text';
          console.log(`🔍 CONTENT_STATE: Delta has text type: ${hasTextType}`);
          
          // Extract content from the JSON structure
          const extractedContent = jsonData.choices?.[0]?.delta?.content;
          
          if (extractedContent) {
            console.log(`📄 CONTENT_STATE: Extracted content: "${extractedContent.substring(0, 100)}${extractedContent.length > 100 ? '...' : ''}"`);
            
            // Check if the content contains block tags
            if (extractedContent.includes('<block') || 
                extractedContent.includes('</block>') ||
                extractedContent.includes('<response_json>') || 
                extractedContent.includes('</response_json>')) {
              
              console.log(`🏷️ CONTENT_STATE: Detected block or meta tags in content`);
              
              // Check for block type and update metadata
              if (extractedContent.includes('<block type="') && jsonData.choices[0].delta.metadata) {
                // Extract the block type
                const blockTypeMatch = /<block\s+type=["']([^"']*)["'][^>]*>/.exec(extractedContent);
                if (blockTypeMatch && blockTypeMatch[1]) {
                  const blockType = blockTypeMatch[1];
                  console.log(`🏷️ CONTENT_STATE: Detected block type from tag: ${blockType}`);
                  
                  // Update the metadata with the correct block type
                  jsonData.choices[0].delta.metadata.blockType = blockType;
                  console.log(`✅ CONTENT_STATE: Updated metadata with block type: ${blockType}`);
                }
              }
              
              // Strip response_json and version tags, but keep block tags
              let cleanedContent = extractedContent;
              
              // Remove response_json tags
              cleanedContent = cleanedContent.replace(/<response_json>\s*/g, '');
              cleanedContent = cleanedContent.replace(/\s*<\/response_json>/g, '');
              
              // Remove version tags
              cleanedContent = cleanedContent.replace(/<version>[^<]*<\/version>\s*/g, '');
              
              console.log(`✅ CONTENT_STATE: Returning cleaned content with block tags`);
              return cleanedContent;
            }
            
            console.log(`✅ CONTENT_STATE: Returning extracted content`);
            return extractedContent;
          } else {
            console.log(`⚠️ CONTENT_STATE: No content found in delta`);
          }
        }
      } catch (jsonError) {
        console.log(`⚠️ CONTENT_STATE: JSON parsing error: ${jsonError.message}`);
        // Fall back to regex approach if JSON parsing fails
        const match = /"content":\s*"((?:[^"\\]|\\.)*)"/s.exec(content);
        if (match && match[1]) {
          // Unescape the JSON string escape sequences
          let extractedContent = match[1].replace(/\\"/g, '"')
                                         .replace(/\\\\/g, '\\')
                                         .replace(/\\n/g, '\n')
                                         .replace(/\\r/g, '\r')
                                         .replace(/\\t/g, '\t');
          
          // Check if the content contains block tags
          if (extractedContent.includes('<block') || 
              extractedContent.includes('</block>') ||
              extractedContent.includes('<response_json>') || 
              extractedContent.includes('</response_json>')) {
            
            // Check for block type
            if (extractedContent.includes('<block type="')) {
              // Extract the block type
              const blockTypeMatch = /<block\s+type=["']([^"']*)["'][^>]*>/.exec(extractedContent);
              if (blockTypeMatch && blockTypeMatch[1]) {
                const blockType = blockTypeMatch[1];
                console.log(`🏷️ CONTENT_STATE: Detected block type from tag in regex fallback: ${blockType}`);
                
                // Try to update metadata if available
                try {
                  const jsonStartIndex = content.indexOf('{');
                  const jsonEndIndex = content.lastIndexOf('}') + 1;
                  
                  if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
                    const jsonObject = JSON.parse(content.substring(jsonStartIndex, jsonEndIndex));
                    if (jsonObject.choices && jsonObject.choices[0] && jsonObject.choices[0].delta && jsonObject.choices[0].delta.metadata) {
                      jsonObject.choices[0].delta.metadata.blockType = blockType;
                      console.log(`✅ CONTENT_STATE: Updated metadata with block type in regex fallback: ${blockType}`);
                    }
                  }
                } catch (e) {
                  console.log(`⚠️ CONTENT_STATE: Could not update metadata: ${e.message}`);
                }
              }
            }
            
            // Strip response_json and version tags, but keep block tags
            let cleanedContent = extractedContent;
              
            // Remove response_json tags
            cleanedContent = cleanedContent.replace(/<response_json>\s*/g, '');
            cleanedContent = cleanedContent.replace(/\s*<\/response_json>/g, '');
              
            // Remove version tags with more robust patterns
            cleanedContent = cleanedContent.replace(/<version>.*?<\/version>\s*/gs, '');
            // Backup pattern for potentially malformed tags
            cleanedContent = cleanedContent.replace(/<version>[^<]*<\/version>/g, '');
              
            return cleanedContent;
          }
          
          return extractedContent;
        }
      }
    }
    
    // Return original if no pattern matches
    return content;
  } catch (e) {
    return content;
  }
}

/**
 * Process block tags in content to convert them to styled HTML
 */
function processBlockTags(content: string): string {
  // Handle response_json wrapper
  let processed = content;
  
  if (processed.includes('<response_json>')) {
    processed = processed
      .replace(/<response_json>/g, '<div class="response-json">')
      .replace(/<\/response_json>/g, '</div>');
  }
  
  // Handle version tags
  processed = processed
    .replace(/<version>(.*?)<\/version>/g, '<div class="version">$1</div>');
  
  // Handle block tags with type attribute
  processed = processed
    .replace(/<block\s+type=["']([^"']*)["']>/g, (match, type) => {
      return `<div class="block block-${type}">`;
    })
    .replace(/<block\s+type=\\([^>]*)>/g, (match, type) => {
      // Handle malformed block tags with backslashes
      const typeMatch = type.match(/([a-zA-Z0-9_-]+)/);
      const cleanType = typeMatch ? typeMatch[1] : 'text';
      return `<div class="block block-${cleanType}">`;
    })
    .replace(/<\/block>/g, '</div>');
  
  return processed;
}

/**
 * Process token update state content
 */
function processTokenUpdateState(content: string): string {
  try {
    // Extract token count information
    if (content.includes('"type": "token_update"')) {
      const tokenCountMatch = /"token_count":\s*(\d+)/.exec(content);
      const maxTokensMatch = /"max_context_tokens":\s*(\d+)/.exec(content);
      
      if (tokenCountMatch && maxTokensMatch) {
        const tokenCount = parseInt(tokenCountMatch[1], 10);
        const maxTokens = parseInt(maxTokensMatch[1], 10);
        const percentage = ((tokenCount / maxTokens) * 100).toFixed(1);
        
        return `Token usage: ${tokenCount}/${maxTokens} (${percentage}%)`;
      }
    }
    
    // Return original if no pattern matches
    return content;
  } catch (e) {
    return content;
  }
}

/**
 * Process tool call state content
 */
function processToolCallState(content: string): string {
  try {
    // Simple tool call formatting
    if (content.includes('"type": "action"')) {
      // For now, just return the content as is
      return content;
    }
    
    // Return original if no pattern matches
    return content;
  } catch (e) {
    return content;
  }
}

// Store tool information
let currentToolInfo = {
  toolName: null,
  resultType: null
};

/**
 * Process tool result state content
 */
function processToolResultState(content: string): string {
  // Process start and end markers
  if (content.includes('"type": "tool_result_start"') || content.includes('"type": "tool_result_end"')) {
    try {
      // Extract the JSON part
      const jsonStartIndex = content.indexOf('{');
      const jsonEndIndex = content.lastIndexOf('}') + 1;
      const jsonString = content.substring(jsonStartIndex, jsonEndIndex);
      
      // Parse the JSON
      const parsedData = JSON.parse(jsonString);
      
      // Store tool info
      if (parsedData.tool) currentToolInfo.toolName = parsedData.tool;
      if (parsedData.result_type) currentToolInfo.resultType = parsedData.result_type;
      
      // Log the stored values
      console.log('Tool Info Updated:', {
        toolName: currentToolInfo.toolName,
        resultType: currentToolInfo.resultType,
        markerType: parsedData.type
      });
      
      // Don't display start/end markers
      return '';
    } catch (e) {
      // If parsing fails, return original
      console.error('Error processing tool marker:', e);
      return content;
    }
  }
  
  // Process actual tool result content
  if (content.includes('"type": "tool_result"')) {
    try {
      // Extract the JSON part
      const jsonStartIndex = content.indexOf('{');
      const jsonEndIndex = content.lastIndexOf('}') + 1;
      const jsonString = content.substring(jsonStartIndex, jsonEndIndex);
      
      // Parse the JSON
      const parsedData = JSON.parse(jsonString);
      
      // Check if this is a tool result with content
      if (parsedData.type === 'tool_result' && parsedData.content) {
        // Get the raw content
        const rawContent = parsedData.content;
        
        // Instead of embedding metadata in the content as a comment, we'll use the metadata parameter
        // that's passed to processStateContent and passed along to the renderer
        
        // Return just the raw content
        return rawContent;
      }
    } catch (e) {
      // If parsing fails, just return the original content
      console.error('Error processing tool result:', e);
    }
  }
  
  // Return everything else completely unchanged
  return content;
}

/**
 * Process completion state content
 */
function processCompletionState(content: string): string {
  return content;
}

/**
 * Process end state content
 */
function processEndState(content: string): string {
  return content;
}

/**
 * Process a text block using the new text formatter
 */
export function processTextBlock(content: string, metadata?: Record<string, any>): string {
  // Import dynamically to avoid circular dependencies
  const { textFormatter } = require('./blockFormatters');
  
  try {
    const result = textFormatter.format(content, metadata || {});
    return result.html;
  } catch (e) {
    console.error('Error formatting text block:', e);
    // Fall back to simple HTML wrapping - do not escape the content so HTML renders properly
    return `<div class="block-text-content">${content}</div>`;
  }
}

/**
 * Check if text content is partial and might be continued in the next chunk
 */
export function isPartialTextContent(content: string): boolean {
  // Import dynamically to avoid circular dependencies
  const { textFormatter } = require('./blockFormatters');
  
  try {
    return textFormatter.isPartialContent(content);
  } catch (e) {
    console.error('Error checking if text is partial:', e);
    return false;
  }
}

/**
 * Combine partial text chunks intelligently
 */
export function combineTextChunks(previousContent: string, newContent: string): string {
  // Import dynamically to avoid circular dependencies
  const { textFormatter } = require('./blockFormatters');
  
  try {
    return textFormatter.combineContentChunks(previousContent, newContent);
  } catch (e) {
    console.error('Error combining text chunks:', e);
    // Simple fallback
    return previousContent + ' ' + newContent;
  }
}

/**
 * Helper function to try parsing JSON
 */
export function tryParseJson(content: string): any | null {
  try {
    // Extract JSON data portion if it starts with "data: "
    if (content.startsWith('data: ')) {
      const jsonStr = content.substring(5).trim();
      return JSON.parse(jsonStr);
    }
    
    // Try to parse as is
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}