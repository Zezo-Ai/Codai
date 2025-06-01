/**
 * StreamStates - Chat state processor
 * 
 * Handles content from AI responses, processes special elements like
 * tool calls, actions, and tool results, and generates properly
 * styled HTML for rendering in the UI.
 */

import { processStrReplace, calculateStrReplaceProgress, generateStrReplaceDiffHtml } from './fileOperations/strReplaceHandler';
import { ExpertModeManager, ExpertModeStatus } from './ExpertModeManager';

/**
 * Structured representation of an action
 */
interface ActionData {
  command?: string;     // create, str_replace, view, insert, undo_edit, etc.
  path?: string;        // File or directory path
  file_text?: string;   // Content for create actions
  old_str?: string;     // Original content for str_replace actions
  new_str?: string;     // New content for str_replace/insert actions
  insert_line?: number; // Line number for insert actions
  view_range?: number[]; // Line range for view actions
  target_path?: string; // Target path for move/copy operations
  recursive?: boolean;  // Whether operation is recursive (delete, copy)
  
  // State tracking
  isPathComplete?: boolean; // Whether the path detection is complete
  isCommandComplete?: boolean; // Whether command detection is complete
  isContentStarted?: boolean; // Whether content has started arriving
  isContentComplete?: boolean; // Whether content is complete
  isInsertLineDetected?: boolean; // Whether insert line has been detected
}

/**
 * UI Component state for actions
 */
interface ActionComponentState {
  id: string;                       // Unique component ID
  type: 'create' | 'edit' | 'system'; // Component type
  status: 'detecting' | 'in-progress' | 'complete'; // Current status
  path?: string;                    // Complete file path (if detected)
  partialPath?: string;             // Partial file path fragment (during incremental detection)
  content?: string;                 // Content preview
  headerText: string;               // Header text for preview section
  statusText: string;               // Status message
  timestamp: number;                // Creation timestamp
}

/**
 * Debug logger utility with color formatting
 */
const debugLog = {
  // Colors for different log types
  colors: {
    action: 'color: white; background-color: #7b68ee; padding: 2px 5px; border-radius: 3px;', // purple for actions
    parse: 'color: white; background-color: #4682b4; padding: 2px 5px; border-radius: 3px;',  // steel blue for parsing
    type: 'color: white; background-color: #20b2aa; padding: 2px 5px; border-radius: 3px;',   // light sea green for type detection
    ui: 'color: white; background-color: #ff8c00; padding: 2px 5px; border-radius: 3px;',     // dark orange for UI updates
    buffer: 'color: white; background-color: #6a5acd; padding: 2px 5px; border-radius: 3px;', // slate blue for buffer updates
    error: 'color: white; background-color: #dc143c; padding: 2px 5px; border-radius: 3px;',  // crimson for errors
    success: 'color: white; background-color: #228b22; padding: 2px 5px; border-radius: 3px;',// forest green for success
    warning: 'color: black; background-color: #ffd700; padding: 2px 5px; border-radius: 3px;',// gold for warnings
    info: 'color: white; background-color: #4169e1; padding: 2px 5px; border-radius: 3px;',   // royal blue for info
    
    // Text colors
    textRed: 'color: #ff0000;',
    textGreen: 'color: #00cc00;',
    textBlue: 'color: #0088ff;',
    textOrange: 'color: #ff8c00;',
    textPurple: 'color: #9370db;',
    textYellow: 'color: #ffcc00;',
  },
  
  // Main log methods
  action: (title, ...data) => {
    // console.log(`%c ACTION ${title} `, debugLog.colors.action, ...data);
  },
  
  parse: (title, ...data) => {
    // console.log(`%c PARSE ${title} `, debugLog.colors.parse, ...data);
  },
  
  type: (title, ...data) => {
    // console.log(`%c TYPE ${title} `, debugLog.colors.type, ...data);
  },
  
  ui: (title, ...data) => {
    // console.log(`%c UI ${title} `, debugLog.colors.ui, ...data);
  },
  
  buffer: (title, ...data) => {
    // console.log(`%c BUFFER ${title} `, debugLog.colors.buffer, ...data);
  },
  
  error: (title, ...data) => {
    // console.log(`%c ERROR ${title} `, debugLog.colors.error, ...data);
  },
  
  success: (title, ...data) => {
    // console.log(`%c SUCCESS ${title} `, debugLog.colors.success, ...data);
  },
  
  warning: (title, ...data) => {
    // console.log(`%c WARNING ${title} `, debugLog.colors.warning, ...data);
  },
  
  info: (title, ...data) => {
    // console.log(`%c INFO ${title} `, debugLog.colors.info, ...data);
  },
  
  // Special styled logs
  jsonPreview: (title, jsonData) => {
    // Empty implementation
  },
  
  actionProgress: (actionId, type, progress, previewText) => {
    // Empty implementation 
  },
  
  textDiff: (title, oldText, newText) => {
    // Empty implementation
  },
  
  separator: () => {
    // Empty implementation
  }
};

/**
 * Supported state types
 */
export type StreamState = 
  | 'INITIAL'   // Initial state
  | 'CONTENT'   // Regular content
  | 'TOOL_CALL' // Tool calls (requests)
  | 'TOOL_RESULT' // Tool responses/results
  | 'FILE_CONTENT' // File content display
  | 'FILE_CREATE' // File creation operation
  | 'FILE_EDIT'   // File edit operation
  | 'END';      // End of stream

/**
 * Action object interface
 */
interface ActionObject {
  operation?: string;
  command?: string;
  action?: string;
  path?: string;
  query?: string;
  [key: string]: any; // Additional properties
}

/**
 * Formatters for different content types
 */
const formatters = {
  /**
   * Format a tool result image into HTML
   */
  formatToolResultImage(imageData: string, alt: string = "Screenshot"): string {
    try {
      // Ensure the image data is valid base64
      if (!imageData.startsWith('iVBOR') && !imageData.startsWith('data:image')) {
        throw new Error('Invalid image data format');
      }
      
      // Ensure it has the proper data:image prefix for browser rendering
      const imgSrc = imageData.startsWith('data:image') 
        ? imageData 
        : `data:image/png;base64,${imageData}`;
      
      // Create a properly styled image element
      return `<div class="tool-result-image-container">
        <img src="${imgSrc}" alt="${alt}" class="tool-result-image" />
      </div>`;
    } catch (e) {
      // If there's any error, return a fallback message
      return `<div class="tool-result-error">Could not display image: ${e.message}</div>`;
    }
  },
  
  /**
   * Format a JSON action object into HTML
   */
  formatAction(json: string): string {
    try {
      // Parse the JSON
      const action = JSON.parse(json) as ActionObject;
      
      // Check for various tool types directly in raw JSON
      if (json.includes('folder_ops')) {
        console.log('Detected folder_ops in action JSON');
        action.tool = 'folder_ops';
      } else if (json.includes('web_search')) {
        console.log('Detected web_search in action JSON');
        action.tool = 'web_search';
      } else if (json.includes('web_fetch')) {
        console.log('Detected web_fetch in action JSON');
        action.tool = 'web_fetch';
      } else if (json.includes('str_replace_editor')) {
        console.log('Detected str_replace_editor in action JSON');
        action.tool = 'str_replace_editor';
      } else if (json.includes('cli_exec')) {
        console.log('Detected cli_exec in action JSON');
        action.tool = 'cli_exec';
      }
      
      // Determine action type
      const type = action.operation 
        ? `operation:${action.operation}` 
        : action.command 
          ? `command:${action.command}` 
          : action.action 
            ? `action:${action.action}`
            : 'unknown';
            
      // Determine icon and title
      let icon = '🔧';
      let title = 'System Action';
      let cssClass = 'action-block';
      
      // Set icon based on type
      if (action.operation === 'list') {
        icon = '📁';
        title = 'List Directory';
      } else if (action.operation === 'create') {
        icon = '📁';
        title = 'Create Directory';
      } else if (action.operation === 'delete') {
        icon = '🗑️';
        title = 'Delete Item';
      } else if (action.operation === 'move') {
        icon = '🔄';
        title = 'Move Item';
      } else if (action.operation === 'copy') {
        icon = '📋';
        title = 'Copy Item';
      } else if (action.operation === 'info') {
        icon = '🔧';
        title = 'System Action';
        cssClass = 'action-block action-info';
      } else if (action.command === 'view' && action.tool !== 'folder_ops') {
        // Only treat as a file view if it's not from folder_ops
        icon = '🔍';
        title = 'View File';
      } else if (action.command === 'view' && action.tool === 'folder_ops') {
        // Handle folder_ops view as a list operation
        icon = '📁';
        title = 'List Directory';
      } else if (action.command === 'create') {
        icon = '📄';
        title = 'Create File';
        cssClass = 'action-block action-create';
      } else if (action.command === 'str_replace') {
        icon = '✏️';
        title = 'Edit File';
        cssClass = 'action-block action-edit';
      } else if (action.command === 'insert') {
        icon = '📝';
        title = 'Insert Content';
        cssClass = 'action-block action-insert';
      } else if (action.command === 'undo_edit') {
        icon = '↩️';
        title = 'Undo Edit';
        cssClass = 'action-block action-undo';
      } else if (action.action === 'web_search' || action.query) {
        icon = '🔍';
        title = 'Web Search';
      } else if (action.action === 'web_fetch' || action.action === 'web_scrape' || action.url) {
        icon = '🌐';
        title = 'Fetch Web Content';
      } else if (action.action === 'screenshot') {
        icon = '📸';
        title = 'Take Screenshot';
      } else if (action.action === 'execute' || action.tool === 'cli_exec') {
        icon = '💻';
        title = 'Run Command';
        cssClass = 'action-block action-execute';
      } else if (action.action === 'left_click') {
        icon = '🖱️';
        title = 'Mouse Click';
        cssClass = 'action-block action-mouse';
      } else if (action.action === 'right_click') {
        icon = '🖱️';
        title = 'Right Click';
        cssClass = 'action-block action-mouse';
      } else if (action.action === 'double_click') {
        icon = '🖱️';
        title = 'Double Click';
        cssClass = 'action-block action-mouse';
      } else if (action.action === 'mouse_move') {
        icon = '🖱️';
        title = 'Mouse Move';
        cssClass = 'action-block action-mouse';
      } else if (action.action === 'left_click_drag') {
        icon = '🖱️';
        title = 'Mouse Drag';
        cssClass = 'action-block action-mouse';
      } else if (action.action === 'key' || action.action === 'type') {
        icon = '⌨️';
        title = 'Keyboard Input';
        cssClass = 'action-block action-keyboard';
      } else if (action.action === 'wait') {
        icon = '⏱️';
        title = 'Wait';
        cssClass = 'action-block action-wait';
      }
      
      // Create display text
      let displayText = '';
      if (action.operation === 'list') {
        displayText = `Listing directory: ${action.path}`;
      } else if (action.operation === 'info') {
        displayText = `Getting information about: ${action.path}`;
      } else if (action.operation === 'create') {
        displayText = `Creating directory: ${action.path}`;
      } else if (action.operation === 'delete') {
        displayText = `Deleting: ${action.path}${action.recursive ? ' (recursive)' : ''}`;
      } else if (action.operation === 'move') {
        displayText = `Moving: ${action.path} to ${action.target_path || 'destination'}`;
      } else if (action.operation === 'copy') {
        displayText = `Copying: ${action.path} to ${action.target_path || 'destination'}`;
      } else if (action.command === 'view' && action.tool !== 'folder_ops') {
        displayText = `Viewing file: ${action.path}`;
        if (action.view_range && action.view_range.length === 2) {
          displayText += ` (lines ${action.view_range[0]}-${action.view_range[1] === -1 ? 'end' : action.view_range[1]})`;
        }
      } else if (action.command === 'view' && action.tool === 'folder_ops') {
        displayText = `Listing directory: ${action.path}`;
      } else if (action.command === 'create') {
        // For file creation, show the path and a preview of content
        let preview = '';
        if (action.file_text) {
          // Get first few lines with reasonable length
          const lines = action.file_text.split('\n').slice(0, 3);
          const previewText = lines.join('\n');
          // Truncate if too long
          preview = previewText.length > 100 
            ? previewText.substring(0, 100) + '...' 
            : previewText;
          // Add line count if there are more lines
          if (action.file_text.split('\n').length > 3) {
            preview += `\n(+ ${action.file_text.split('\n').length - 3} more lines)`;
          }
        }
        displayText = `Creating file: ${action.path}\n${preview ? `Content preview:\n${preview}` : ''}`;
      } else if (action.command === 'insert') {
        displayText = `Inserting at line ${action.insert_line || 'unknown'} in: ${action.path}`;
        // Preview content to be inserted
        if (action.new_str) {
          const lines = action.new_str.split('\n');
          const previewText = lines.slice(0, Math.min(3, lines.length)).join('\n');
          const preview = previewText.length > 100 
            ? previewText.substring(0, 100) + '...' 
            : previewText;
          
          if (lines.length > 3) {
            displayText += `\nInserting ${lines.length} lines:\n${preview}\n(+ ${lines.length - 3} more lines)`;
          } else {
            displayText += `\nInserting content:\n${preview}`;
          }
        }
      } else if (action.command === 'undo_edit') {
        displayText = `Undoing last edit to: ${action.path}`;
      } else if (action.action === 'web_search' || action.query) {
        const query = action.query || '';
        const numResults = action.num_results ? ` (${action.num_results} results)` : '';
        displayText = `Searching for: "${query}"${numResults}`;
      } else if (action.action === 'web_fetch' || action.action === 'web_scrape' || action.url) {
        const extractMode = action.extract_mode ? ` (${action.extract_mode})` : '';
        displayText = `Fetching content from: ${action.url}${extractMode}`;
      } else if (action.action === 'screenshot') {
        displayText = `Taking a screenshot of the current window`;
      } else if (action.action === 'execute' || action.tool === 'cli_exec' || action.command === 'execute') {
        if (action.command_line) {
          displayText = `Executing command: ${action.command_line}`;
        } else if (action.text) {
          displayText = `Executing command: ${action.text}`;
        } else {
          displayText = `Executing command`;
        }
      } else if (action.action === 'left_click' && action.coordinate) {
        displayText = `Clicking at position: (${action.coordinate[0]}, ${action.coordinate[1]})`;
      } else if (action.action === 'right_click' && action.coordinate) {
        displayText = `Right-clicking at position: (${action.coordinate[0]}, ${action.coordinate[1]})`;
      } else if (action.action === 'double_click' && action.coordinate) {
        displayText = `Double-clicking at position: (${action.coordinate[0]}, ${action.coordinate[1]})`;
      } else if (action.action === 'mouse_move' && action.coordinate) {
        displayText = `Moving cursor to position: (${action.coordinate[0]}, ${action.coordinate[1]})`;
      } else if (action.action === 'left_click_drag' && action.coordinate) {
        displayText = `Dragging to position: (${action.coordinate[0]}, ${action.coordinate[1]})`;
      } else if (action.action === 'key') {
        displayText = `Pressing key: ${action.text || 'unknown'}`;
      } else if (action.action === 'type') {
        displayText = `Typing text: "${action.text || ''}"`;
      } else if (action.action === 'wait') {
        const duration = action.duration || 0;
        const unit = duration === 1 ? 'second' : 'seconds';
        displayText = `Waiting for ${duration} ${unit}`;
      } else {
        // Default fallback
        displayText = JSON.stringify(action, null, 2);
      }
      
      // Prepare preview content for create and edit operations
      let previewContent = '';
      
      if (action.command === 'create' && action.file_text) {
        // For file creation, add a styled preview
        const lines = action.file_text.split('\n');
        const previewText = lines.slice(0, Math.min(5, lines.length)).join('\n');
        const remainingLines = lines.length > 5 ? `\n(+ ${lines.length - 5} more lines)` : '';
        
        previewContent = `
          <div class="action-preview">
            <div class="action-preview-header">Content Preview:</div>
            <pre class="action-preview-content">${previewText}${remainingLines}</pre>
          </div>
        `;
      } else if (action.command === 'str_replace' && action.old_str && action.new_str) {
        // For file editing, show a diff view
        previewContent = `
          <div class="action-preview">
            <div class="action-preview-header">Changes:</div>
            <div class="action-diff">
              <div class="action-diff-old">
                <div class="action-diff-header">Original</div>
                <pre class="action-diff-content">${action.old_str}</pre>
              </div>
              <div class="action-diff-new">
                <div class="action-diff-header">Modified</div>
                <pre class="action-diff-content">${action.new_str}</pre>
              </div>
            </div>
          </div>
        `;
      } else if (action.command === 'insert' && action.new_str) {
        // For insert operations, show what's being inserted
        const lines = action.new_str.split('\n');
        const previewText = lines.slice(0, Math.min(5, lines.length)).join('\n');
        const remainingLines = lines.length > 5 ? `\n(+ ${lines.length - 5} more lines)` : '';
        
        previewContent = `
          <div class="action-preview">
            <div class="action-preview-header">Content to Insert:</div>
            <div class="action-insert">
              <div class="action-insert-location">
                <div class="action-insert-header">Inserting at Line</div>
                <div class="action-insert-line">${action.insert_line || 'unknown'}</div>
              </div>
              <div class="action-insert-content">
                <div class="action-insert-header">Content</div>
                <pre class="action-insert-text">${previewText}${remainingLines}</pre>
              </div>
            </div>
          </div>
        `;
      } else if (action.command === 'undo_edit') {
        // For undo operations, show a simple message
        previewContent = `
          <div class="action-preview">
            <div class="action-preview-header">Undo Operation:</div>
            <pre class="action-preview-content">Reverting last edit to ${action.path}</pre>
          </div>
        `;
      }
      
      // Enhanced HTML structure with preview content
      return `<span class="${cssClass}"><span class="action-container"><span class="action-header"><span class="action-icon" role="img" aria-label="${title}">${icon}</span><span class="action-title">${title}</span></span><span class="action-content"><span class="action-text">${displayText}</span>${previewContent}</span></span></span>`;
    } catch (e) {
      // If formatting fails, return the raw JSON in a pre tag
      return `<span class="json-action">${json}</span>`;
    }
  },
  
  /**
   * Format tool result content
   */
  formatToolResult(content: string): string {
    // Check for web search results
    if (content.includes('[WEB_SEARCH_RESULTS]') && content.includes('[/WEB_SEARCH_RESULTS]')) {
      return this.formatWebSearchResults(content);
    }
    
    // Escape HTML to prevent XSS
    const escapedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    return `<pre class="tool-result-content">${escapedContent}</pre>`;
  },
  
  /**
   * Format web search results into a nicely styled list
   */
  formatWebSearchResults(content: string): string {
    // Remove the web search result tags
    content = content.replace(/\[WEB_SEARCH_RESULTS\]/g, '').replace(/\[\/WEB_SEARCH_RESULTS\]/g, '').trim();
    
    // Extract the search query (usually at the beginning)
    const queryMatch = content.match(/Search results for ['"]([^'"]+)['"] from ([^:]+):/);
    const searchQuery = queryMatch ? queryMatch[1] : '';
    
    // Parse the results from the content
    const lines = content.split('\n');
    let parsedResults = [];
    let currentResult = null;
    
    // Process the content line by line to extract structured results
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Skip the header line
      if (line.includes('Search results for') && line.includes('from')) continue;
      
      // Start of a new result (begins with a number followed by a period)
      if (/^\d+\./.test(line)) {
        // If we were processing a previous result, add it to our collection
        if (currentResult) {
          parsedResults.push(currentResult);
        }
        
        // Initialize a new result object
        currentResult = {
          title: line.replace(/^\d+\.\s*/, '').trim(),
          description: [],
          url: ''
        };
      }
      // URL line
      else if (line.startsWith('URL:')) {
        if (currentResult) {
          currentResult.url = line.replace(/^URL:\s*/, '').trim();
        }
      }
      // Part of the description of the current result
      else if (currentResult) {
        currentResult.description.push(line);
      }
    }
    
    // Add the last result if we have one
    if (currentResult) {
      parsedResults.push(currentResult);
    }
    
    // Process each result to extract proper URLs and clean up
    let results = parsedResults.map(result => {
      // Process DuckDuckGo redirect URLs
      let url = result.url;
      if (url && url.includes('duckduckgo.com/l/?uddg=')) {
        try {
          const uddgMatch = url.match(/uddg=([^&]+)/);
          if (uddgMatch && uddgMatch[1]) {
            url = decodeURIComponent(uddgMatch[1]);
          }
        } catch (e) {
          // Keep original URL if decoding fails
        }
      }
      
      return {
        title: result.title,
        description: result.description.join(' ').trim(),
        url: url
      };
    });
    
    // Filter out results that:
    // 1. Don't have a title
    // 2. Have ad URLs
    // 3. Don't have a URL
    results = results.filter(result => {
      if (!result.title || result.title.length < 5) return false;
      if (!result.url) return false;
      
      const isAd = 
        result.url.includes('duckduckgo.com/y.js?ad_domain') || 
        result.url.includes('/duckduckgo.com/y.js?') ||
        result.url.includes('&ad_domain=');
      
      return !isAd;
    });
    
    // Build the HTML for the results
    let resultsHtml = '';
    results.forEach((result, index) => {
      resultsHtml += `
        <div class="web-search-result">
          <span class="web-search-result-number">${index + 1}</span>
          <div class="web-search-result-content">
            <a href="${result.url}" class="web-search-result-title" target="_blank" rel="noopener noreferrer">${result.title}</a>
            <div class="web-search-result-description">${result.description}</div>
            <div class="web-search-result-url">${result.url}</div>
          </div>
        </div>`;
    });
    
    // Return the formatted HTML with enhanced structure
    return `
      <div class="web-search-results-container">
        <div class="web-search-header">
          <div class="web-search-icon">🔍</div>
          <div class="web-search-query">
            Search results for <strong>"${searchQuery}"</strong>
          </div>
        </div>
        <div class="web-search-results">
          ${resultsHtml}
        </div>
      </div>`;
  },
  
  /**
   * Format file content with appropriate syntax highlighting
   */
  formatFileContent(content: string, fileType: string = '', filePath: string = ''): string {
    // Check if the content is wrapped in markdown code block syntax (```language...```)
    // and extract just the content if it is
    let cleanedContent = content;
    
    // Pattern to match: starts with ```language, has content, ends with ```
    const codeBlockPattern = /^```([\w-]*)\n([\s\S]*?)\n```\s*$/;
    const match = cleanedContent.match(codeBlockPattern);
    
    if (match) {
      // If no file type was provided but we detected a language in the code block,
      // use that as the file type
      if (!fileType && match[1]) {
        fileType = match[1];
      }
      
      // Extract just the content between the backticks
      cleanedContent = match[2];
    }
    
    // Escape HTML to prevent XSS
    const escapedContent = cleanedContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    // Format based on file type
    let language = '';
    
    // Determine language from file extension if not provided
    if (!fileType && filePath) {
      const extension = filePath.split('.').pop()?.toLowerCase();
      if (extension) {
        fileType = extension;
      }
    }
    
    // Map common file extensions to language names
    switch (fileType) {
      case 'js': language = 'javascript'; break;
      case 'ts': language = 'typescript'; break;
      case 'py': language = 'python'; break;
      case 'rb': language = 'ruby'; break;
      case 'java': language = 'java'; break;
      case 'c': language = 'c'; break;
      case 'cpp': language = 'cpp'; break;
      case 'cs': language = 'csharp'; break;
      case 'go': language = 'go'; break;
      case 'php': language = 'php'; break;
      case 'swift': language = 'swift'; break;
      case 'kt': language = 'kotlin'; break;
      case 'rs': language = 'rust'; break;
      case 'sh': language = 'bash'; break;
      case 'md': language = 'markdown'; break;
      case 'json': language = 'json'; break;
      case 'yaml': 
      case 'yml': language = 'yaml'; break;
      case 'xml': language = 'xml'; break;
      case 'html': language = 'html'; break;
      case 'css': language = 'css'; break;
      case 'scss': language = 'scss'; break;
      case 'sql': language = 'sql'; break;
      case 'txt': language = 'text'; break;
      default: language = fileType || 'text';
    }
    
    // Get just the filename without the path
    const fileName = filePath.split(/[\/\\]/).pop() || '';
    
    // Add line numbers for better readability
    const contentWithLineNumbers = escapedContent
      .split('\n')
      .map((line, index) => 
        `<div class="file-line"><span class="file-line-number">${index + 1}</span><span class="file-line-content">${line}</span></div>`)
      .join('');
      
    // Add indicator for long files
    const lineCount = escapedContent.split('\n').length;
    const isLongFile = lineCount > 40; // Consider files with more than 40 lines as "long"
    
    // Create a code block with the appropriate language
    return `<div class="file-content-container">
      <div class="file-content-header">
        <span class="file-content-name">${fileName}</span>
        <div class="file-content-meta">
          ${isLongFile ? `<span class="file-content-line-count">${lineCount} lines</span>` : ''}
          ${language ? `<span class="file-content-language">${language}</span>` : ''}
        </div>
      </div>
      <div class="file-content-code language-${language}">${contentWithLineNumbers}</div>
    </div>`;
  }
};

/**
 * StreamStates - Processes content from LLM responses and
 * generates HTML for rendering in the UI
 */
export default class StreamStates {
  // Core properties
  private containerContent: string = '';
  private currentState: StreamState = 'INITIAL';
  
  // Action buffer management
  private actionBuffer: string = '';
  private collectingAction: boolean = false;
  private actionId: string = '';  // Unique ID for the current action
  private actionType: string = ''; // Type of the current action
  private actionPath: string = ''; // Path affected by the current action
  private actionStarted: boolean = false; // Whether the action UI has been started
  
  // Structured action data - used for early detection and progressive UI updates
  private actionData: ActionData = {};
  
  // Component reference system - maps action IDs to their UI component state
  private actionComponents: Map<string, ActionComponentState> = new Map();
  
  // Tool result buffer management
  private toolResultBuffer: string = '';
  private collectingToolResult: boolean = false;
  private toolResultType: string = '';
  private toolResultTool: string = '';
  
  // File content management
  private fileContentBuffer: string = '';
  private collectingFileContent: boolean = false;
  private fileContentPath: string = '';
  private fileContentType: string = '';
  
  // Expert mode management
  private expertModeManager: ExpertModeManager = new ExpertModeManager();
  private expertModeStylesAdded: boolean = false;
  
  /**
   * Create a new StreamStates instance
   * @param containerId The ID of the container element (not used in this implementation)
   */
  constructor(containerId: string) {
    // Initialize with empty content
    this.reset();
  }
  
  // Track chunks for before/after comparisons
  private currentChunk: string = '';
  private nextChunkPreview: string = '';
  private chunkSequence: number = 0;
  private queueLength: number = 0;
  
  /**
   * Process a chunk of data from the stream
   * @param chunk The data chunk to process
   * @param options Additional options for processing
   * @returns The current HTML output
   */
  processChunk(chunk: string, options: { 
    isStreamEnd?: boolean,
    nextChunk?: string,
    queueLength?: number
  } = {}): string {
    // Store next chunk info for end-of-processing logging
    this.nextChunkPreview = options.nextChunk || '';
    this.queueLength = options.queueLength || 0;
    if (!chunk) return this.getHtml();
    
    // Handle thinking-related chunks
    if (chunk.includes('"type":"thinking') || 
        chunk.includes('"type": "thinking') || 
        chunk.includes('thinking_block_') || 
        chunk.includes('extended_thinking') ||
        chunk.includes('thinking_chunk')) {
      // Process normally without logging
      return this.getHtml();
    }
    
    // Handle expert mode status chunks
    if (chunk.includes('"type": "expert_mode_status"') || chunk.includes('"type":"expert_mode_status"')) {
      try {
        // Extract JSON from chunk (remove "data: " prefix if present)
        const jsonStr = chunk.startsWith('data: ') ? chunk.slice(6).trim() : chunk.trim();
        const data = JSON.parse(jsonStr) as ExpertModeStatus;
        
        if (data.type === 'expert_mode_status') {
          // Add styles if not already added
          if (!this.expertModeStylesAdded) {
            this.containerContent += ExpertModeManager.getStyles();
            this.expertModeStylesAdded = true;
          }
          
          // Expert mode status received
          
          // Process the expert mode status and get HTML
          const result = this.expertModeManager.processStatus(data);
          
          if (result.shouldReplace) {
            // Find the last expert mode card using a simple approach
            const expertModeStart = 'class="expert-mode-card';
            
            let lastCardStart = -1;
            let searchPos = 0;
            
            // Find all occurrences of expert mode cards
            while ((searchPos = this.containerContent.indexOf(expertModeStart, searchPos)) !== -1) {
              lastCardStart = this.containerContent.lastIndexOf('<div', searchPos);
              searchPos = searchPos + expertModeStart.length;
            }
            
            if (lastCardStart !== -1) {
              // Find the end of this div by counting div tags
              let divDepth = 0;
              let pos = lastCardStart;
              let cardEnd = -1;
              
              while (pos < this.containerContent.length) {
                if (this.containerContent.substr(pos, 4) === '<div') {
                  divDepth++;
                  pos += 4;
                } else if (this.containerContent.substr(pos, 6) === '</div>') {
                  divDepth--;
                  if (divDepth === 0) {
                    cardEnd = pos + 6;
                    break;
                  }
                  pos += 6;
                } else {
                  pos++;
                }
              }
              
              if (cardEnd !== -1) {
                // Replace the existing expert mode card
                const beforeCard = this.containerContent.substring(0, lastCardStart);
                const afterCard = this.containerContent.substring(cardEnd);
                this.containerContent = beforeCard + result.html + afterCard;
              } else {
                this.containerContent += result.html;
              }
            } else {
              this.containerContent += result.html;
            }
          } else {
            // Just append
            this.containerContent += result.html;
          }
        }
      } catch (error) {
        // Silently ignore parsing errors
        console.warn('Expert mode status parsing error:', error);
      }
      return this.getHtml();
    }
    
    // Quick check if this chunk is action-related to avoid logging non-action chunks
    const isActionRelated = 
      this.collectingAction || // Already collecting an action
      chunk.includes('"type": "action"') || // Contains action type
      chunk.includes('"command": "create"') || // Contains create command
      chunk.includes('"command": "str_replace"'); // Contains edit command
    
    // Only log if this chunk is action-related
    if (isActionRelated) {
      // Increment chunk sequence number
      this.chunkSequence++;
      
      // Save current chunk for reference
      this.currentChunk = chunk;
      
      // Clear boundary in console for easier visual separation
      // console.log('\n\n');
      // debugLog.separator();
      // console.log(`%c CHUNK #${this.chunkSequence} PROCESSING START `, 'color: white; background-color: #8a2be2; padding: 3px 8px; font-weight: bold; border-radius: 4px;');
      // debugLog.separator();
      
      // Log detailed chunk information with extra clarity
      const chunkPreview = chunk.length > 150 ? `${chunk.substring(0, 150)}...` : chunk;
      // console.log(`%c ┌─ CHUNK #${this.chunkSequence} ─┐ `, 'color: white; background-color: #4169e1; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
      // debugLog.info("RECEIVED CHUNK", `Sequence: #${this.chunkSequence}, Length: ${chunk.length} bytes`);
      
      // Use console.group instead of groupCollapsed to show everything expanded
      // console.group('%c CHUNK CONTENT (EXPANDED) ', 'color: white; background-color: #4682b4; padding: 2px 6px; border-radius: 3px;');
      // console.log(chunkPreview);
      // console.groupEnd();
      
      // Log current buffer state before processing - always show buffer information
      if (this.collectingAction) {
        // debugLog.buffer("BUFFER BEFORE", `Current action buffer size: ${this.actionBuffer.length} bytes, Chunks collected so far: ${this.chunkSequence}`);
        // console.group('%c BUFFER STATE BEFORE (EXPANDED) ', 'color: white; background-color: #6a5acd; padding: 2px 6px; border-radius: 3px;');
        
        // Always show full raw buffer content
        // console.log('%c FULL BUFFER CONTENT ', 'color: white; background-color: #483d8b; padding: 2px 6px; border-radius: 3px;');
        // console.log(this.actionBuffer);
        
        // Also show segmented view for better analysis
        if (this.actionBuffer.length > 0) {
          // console.log('%c BUFFER SEGMENTS ', 'color: white; background-color: #483d8b; padding: 2px 6px; border-radius: 3px;');
          // console.log('BEGINNING (first 100 chars):', this.actionBuffer.substring(0, 100));
          
          if (this.actionBuffer.length > 200) {
            // console.log('MIDDLE (middle 100 chars):', this.actionBuffer.substring(
            //   Math.floor(this.actionBuffer.length / 2) - 50, 
            //   Math.floor(this.actionBuffer.length / 2) + 50
            // ));
          }
          
          if (this.actionBuffer.length > 100) {
            // console.log('END (last 100 chars):', this.actionBuffer.substring(this.actionBuffer.length - 100));
          }
        }
        
        // console.groupEnd();
      } else {
        debugLog.buffer("NO BUFFER", "Not collecting action data yet");
      }
    }
    
    // SPECIAL TYPE 1: TOOL_RESULT_START - beginning of tool result
    if (chunk.includes('"type": "tool_result_start"')) {
      try {
        // Only log if we were collecting an action (which is being interrupted by this tool result)
        if (this.collectingAction) {
          debugLog.info("TOOL_RESULT_START", "Detected tool result start - interrupting action collection");
        }
        
        // Flush any pending action buffer
        this.flushActionBuffer();
        
        // Parse the data to get tool type
        const jsonStr = chunk.slice(5).trim();
        const parsedData = JSON.parse(jsonStr);
        
        // Start collecting tool result
        this.collectingToolResult = true;
        this.toolResultBuffer = '';
        this.toolResultType = parsedData.result_type || '';
        this.toolResultTool = parsedData.tool || '';
        
        // Only log if we were collecting an action that got interrupted
        if (this.collectingAction) {
          debugLog.success("TOOL_RESULT", `Started collecting tool result: ${this.toolResultTool}, type: ${this.toolResultType}`);
        }
        
        return this.getHtml();
      } catch (error) {
        // Only log errors if we're in action debugging mode
        if (this.collectingAction) {
          debugLog.error("TOOL_RESULT_PARSE", `Failed to parse tool result start: ${error.message}`);
        }
        // If parsing fails, ignore this chunk
        return this.getHtml();
      }
    }
    
    // SPECIAL TYPE 2: TOOL_RESULT_END - end of tool result
    if (chunk.includes('"type": "tool_result_end"')) {
      // Process the collected tool result data
      this.flushToolResultBuffer();
      return this.getHtml();
    }
    
    // SPECIAL TYPE: FILE_CONTENT_START - beginning of file content
    if (chunk.includes('"type": "file_content_start"')) {
      try {
        // Flush any pending action buffer before starting file content display
        this.flushActionBuffer();
        
        // Parse the data to get file information
        const jsonStr = chunk.slice(5).trim();
        const parsedData = JSON.parse(jsonStr);
        
        // Start collecting file content
        this.collectingFileContent = true;
        this.fileContentBuffer = '';
        this.fileContentPath = parsedData.path || '';
        
        // Determine file type from path or metadata
        if (parsedData.metadata && parsedData.metadata.file_type) {
          this.fileContentType = parsedData.metadata.file_type;
        } else if (this.fileContentPath) {
          const extension = this.fileContentPath.split('.').pop()?.toLowerCase();
          if (extension) {
            this.fileContentType = extension;
          }
        }
        
        return this.getHtml();
      } catch (error) {
        // If parsing fails, ignore this chunk
        return this.getHtml();
      }
    }
    
    // SPECIAL TYPE: FILE_CONTENT_END - end of file content
    if (chunk.includes('"type": "file_content_end"')) {
      // Process the collected file content
      this.flushFileContentBuffer();
      return this.getHtml();
    }
    
    // SPECIAL TYPE: ACTION_UPDATE - progress update for a file operation
    if (chunk.includes('"type": "action_update"')) {
      try {
        // Parse the data to get action update details
        const jsonStr = chunk.slice(5).trim();
        const parsedData = JSON.parse(jsonStr);
        
        // Find the progress container and update it
        const progressId = parsedData.id || '';
        const progress = parsedData.progress || 0;
        const status = parsedData.status || 'In progress...';
        
        // Update the action status in the HTML
        const actionPattern = /<span class="action-status">[^<]*<\/span>/;
        this.containerContent = this.containerContent.replace(
          actionPattern,
          `<span class="action-status">${status} (${progress}%)</span>`
        );
        
        return this.getHtml();
      } catch (error) {
        // If parsing fails, ignore this chunk
        return this.getHtml();
      }
    }
    
    // SPECIAL TYPE: ACTION_COMPLETE - completion of a file operation
    if (chunk.includes('"type": "action_complete"')) {
      try {
        // Parse the data to get action completion details
        const jsonStr = chunk.slice(5).trim();
        const parsedData = JSON.parse(jsonStr);
        
        // Get completion details
        const path = parsedData.path || '';
        const status = parsedData.status || 'Complete';
        const content = parsedData.content || '';
        const operation = parsedData.operation || '';
        
        // Mark action as complete in UI
        if (this.containerContent.includes('action-in-progress')) {
          // Replace the in-progress action with completed action
          this.containerContent = this.containerContent.replace(
            'action-in-progress',
            'action-complete'
          );
          
          // Update status
          const actionPattern = /<span class="action-status">[^<]*<\/span>/;
          this.containerContent = this.containerContent.replace(
            actionPattern,
            `<span class="action-status">✓ ${status}</span>`
          );
          
          // If there's content to display, prepare it
          if (content) {
            // Escape HTML in content
            const escapedContent = content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
              
            // Get file extension for syntax highlighting
            const extension = path.split('.').pop()?.toLowerCase() || '';
            let language = '';
            
            // Map common extensions to languages
            switch (extension) {
              case 'js': language = 'javascript'; break;
              case 'ts': language = 'typescript'; break;
              case 'py': language = 'python'; break;
              case 'html': language = 'html'; break;
              case 'css': language = 'css'; break;
              case 'json': language = 'json'; break;
              case 'md': language = 'markdown'; break;
              default: language = 'plaintext';
            }
            
            // Truncate if content is too large
            let displayContent = escapedContent;
            let isTruncated = false;
            
            if (escapedContent.length > 1000) {
              displayContent = escapedContent.substring(0, 1000);
              isTruncated = true;
            }
            
            // Add content preview after action
            const resultMarkup = `
              <div class="action-result">
                <pre class="action-result-code"><code class="language-${language}">${displayContent}</code></pre>
                ${isTruncated ? '<div class="action-result-truncated">Content truncated (showing first 1000 characters)</div>' : ''}
              </div>
            `;
            
            // Find the action container closing tag and insert before it
            const closingTagPosition = this.containerContent.lastIndexOf('</span></span>');
            if (closingTagPosition !== -1) {
              this.containerContent = 
                this.containerContent.substring(0, closingTagPosition) + 
                resultMarkup + 
                this.containerContent.substring(closingTagPosition);
            }
          }
        }
        
        return this.getHtml();
      } catch (error) {
        // If parsing fails, ignore this chunk
        return this.getHtml();
      }
    }
    
    // SPECIAL TYPE 3: TOOL_RESULT or Screenshot content
    if ((chunk.includes('"type": "tool_result"') && chunk.includes('"content":')) ||
        (this.collectingToolResult && chunk.includes('"type": "screenshot"'))) {
      try {
        const jsonStr = chunk.slice(5).trim();
        const parsedData = JSON.parse(jsonStr);
        
        // Case 1: Currently collecting a tool result
        if (this.collectingToolResult) {
          // For screenshot content in delta
          if (parsedData.choices && 
              parsedData.choices[0] && 
              parsedData.choices[0].delta &&
              parsedData.choices[0].delta.type === 'screenshot' &&
              parsedData.choices[0].delta.content) {
            
            this.toolResultBuffer += parsedData.choices[0].delta.content;
          } 
          // For other content in the root or delta
          else if (parsedData.content || 
                 (parsedData.choices && 
                  parsedData.choices[0] && 
                  parsedData.choices[0].delta && 
                  parsedData.choices[0].delta.content)) {
            
            const content = parsedData.content || parsedData.choices[0].delta.content;
            this.toolResultBuffer += content;
          }
          
          // Don't process yet - wait for TOOL_RESULT_END
          return this.getHtml();
        }
        
        // Case 2: Legacy handling for single-chunk tool results
        else if (parsedData.type === 'tool_result' && parsedData.content) {
          const formattedResult = formatters.formatToolResult(parsedData.content);
          this.containerContent += formattedResult;
          return this.getHtml();
        }
      } catch (error) {
        // If JSON parsing fails, just ignore this chunk
      }
    }
    
    // Handle stream end - flush any pending buffers
    if (options.isStreamEnd) {
      this.flushActionBuffer();
      this.flushToolResultBuffer();
      this.flushFileContentBuffer();
    }
    
    // Process regular chunks
    if (chunk.startsWith('data: ')) {
      try {
        const jsonStr = chunk.slice(5).trim();
        const parsedData = JSON.parse(jsonStr);
        
        // Skip control messages
        if (parsedData.type === 'stream_start' || 
            parsedData.type === 'stream_end' || 
            parsedData.type === 'token_update' ||
            parsedData.type === 'tool_result_end') {
          // Only log control messages when we're actively collecting an action
          if (this.collectingAction) {
            debugLog.info("CONTROL MESSAGE", `Type: ${parsedData.type}`);
          }
          return this.getHtml();
        }
        
        // Extract content from delta if available
        if (parsedData.choices && 
            parsedData.choices[0] && 
            parsedData.choices[0].delta) {
            
          // Check if this is an action type
          const isAction = parsedData.choices[0].delta.type === 'action';
          
          // Get the content if available
          const content = parsedData.choices[0].delta.content || '';
          
          if (isAction) {
            debugLog.action("DETECTED", `Content length: ${content.length}`);
            debugLog.jsonPreview("ACTION CONTENT", content);
          }
          
          // If we're collecting file content and this chunk has content
          if (this.collectingFileContent && content) {
            debugLog.buffer("FILE_CONTENT", `Adding ${content.length} chars to file content buffer`);
            // Add to the file content buffer
            this.fileContentBuffer += content;
            return this.getHtml();
          }
          
          // If we were collecting an action and current chunk is not an action, 
          // flush the action buffer to render it
          if (this.collectingAction && !isAction) {
            debugLog.warning("ACTION END", "Current chunk is not an action type, flushing action buffer");
            this.flushActionBuffer();
          }
          
          // Case 1: We're collecting an action and this is part of it
          if (this.collectingAction && isAction) {
            // Continue building the action buffer
            const prevLength = this.actionBuffer.length;
            this.actionBuffer += content;
            
            debugLog.buffer("ACTION APPEND", `Added ${content.length} chars to action buffer (now ${this.actionBuffer.length} total)`);
            
            // First priority: Check for path in current chunk or buffer
            // Use our optimized path detection that handles both complete and partial paths
            // Returns true if a path was found or updated
            this.detectPath(content);
            
            // For file creation and editing actions, we want to progressively update
            // the UI as chunks come in, not wait until the entire action is complete
            if ((this.actionType === 'create' || this.actionType === 'str_replace') && this.actionStarted) {
              debugLog.action("UPDATE PROGRESSIVE", `Updating progressive action: ${this.actionType}`);
              this.updateProgressiveAction();
            } else {
              // Check if we can now determine the action type
              debugLog.action("DETECT TYPE", "Attempting to detect action type from buffer");
              this.detectActionType();
            }
            
            return this.getHtml();
          }
          
          // Case 2: New action starting
          if (!this.collectingAction && isAction && content.includes("{")) {
            // Start collecting a new action
            this.collectingAction = true;
            this.actionId = `action-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            this.actionBuffer = content;
            
            debugLog.action("NEW ACTION", `Started collecting new action with ID: ${this.actionId}`);
            debugLog.buffer("INITIAL", `Initial buffer length: ${content.length}`);
            debugLog.jsonPreview("INITIAL CONTENT", content);
            
            // Reset action data for the new action
            this.actionData = {};
            
            // Early detection of command and path with improved regex
            const commandMatch = content.match(/"command"\s*:\s*"(create|str_replace|view)"/);
            // More robust path regex that handles escaped backslashes in Windows paths
            const pathMatch = content.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            
            // First priority: Extract path using our optimized method
            this.detectPath(content);
            
            // Update structured data with command
            if (commandMatch && commandMatch[1]) {
              debugLog.parse("COMMAND FOUND", `Command: "${commandMatch[1]}"`);
              
              // Update structured data
              this.actionData.command = commandMatch[1];
              this.actionData.isCommandComplete = true;
              this.actionType = commandMatch[1]; // Backward compatibility
              
              // For create and edit actions, we can start UI early with just the command
              if ((commandMatch[1] === 'create' || commandMatch[1] === 'str_replace') && !this.actionStarted) {
                debugLog.ui("EARLY UI", `Starting early UI framework based on command: ${commandMatch[1]}`);
                this.startProgressiveUIFramework();
              }
            }
            
            // If UI already started but path wasn't available before, update it now
            if (this.actionStarted && pathMatch && pathMatch[1] && !this.containerContent.includes('detected-path')) {
              this.updateUIWithPath();
            }
            
            // If we have both command and path and UI hasn't been started, use full progressive UI
            if (commandMatch && commandMatch[1] && pathMatch && pathMatch[1] && !this.actionStarted) {
              // We have complete information to start a full progressive action
              if (commandMatch[1] === 'create' || commandMatch[1] === 'str_replace') {
                debugLog.type("DETERMINED", `Action type: ${this.actionType}, path: ${this.actionPath}`);
                debugLog.ui("STARTING PROGRESSIVE", `Starting progressive UI for ${this.actionType}`);
                
                this.startProgressiveAction();
              } else {
                debugLog.info("NON-PROGRESSIVE", `Command "${commandMatch[1]}" doesn't need progressive UI`);
              }
            } else if (!commandMatch) {
              debugLog.warning("INCOMPLETE", "Command not found, will try to detect later");
            }
            
            return this.getHtml();
          }
          
          // Case 3: Regular content
          if (!this.collectingAction && content) {
            this.containerContent += content;
          }
        }
      } catch (error) {
        // If JSON parsing fails, just ignore this chunk - only log errors for action-related chunks
        const isActionRelated = 
          this.collectingAction || 
          this.currentChunk.includes('"type": "action"') || 
          this.currentChunk.includes('"command": "create"') || 
          this.currentChunk.includes('"command": "str_replace"');
        
        if (isActionRelated) {
          debugLog.error("JSON PARSE ERROR", `Failed to parse chunk as JSON: ${error.message}`);
        }
      }
    }
    
    // End of processing for this chunk - log final state only for action-related chunks
    const wasActionRelated = 
      this.collectingAction ||
      this.currentChunk.includes('"type": "action"') ||
      this.currentChunk.includes('"command": "create"') ||
      this.currentChunk.includes('"command": "str_replace"');
      
    if (wasActionRelated) {
      this.logProcessingEnd();
    }
    
    return this.getHtml();
  }
  
  /**
   * Log the end of chunk processing with buffer state and next chunk preview
   * This provides visibility into what has been processed and what comes next
   */
  private logProcessingEnd(): void {
    // Only log if we have actually processed action-related content
    if (this.chunkSequence === 0) return;
    
    // debugLog.separator();
    // console.log(`%c CHUNK #${this.chunkSequence} PROCESSING COMPLETE `, 'color: white; background-color: #228b22; padding: 3px 8px; font-weight: bold; border-radius: 4px;');
    
    // Log final buffer state after processing - only if we have an action buffer
    if (this.collectingAction && this.actionBuffer) {
      // console.log(`%c └─ CHUNK #${this.chunkSequence} PROCESSED ─┘ `, 'color: white; background-color: #4169e1; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
      // debugLog.buffer("BUFFER AFTER", `Current action buffer size: ${this.actionBuffer.length} bytes, Action Type: ${this.actionType || 'not determined yet'}`);
      // console.group('%c BUFFER STATE AFTER (EXPANDED) ', 'color: white; background-color: #6a5acd; padding: 2px 6px; border-radius: 3px;');
      
      // Always show full raw buffer content
      // console.log('%c FULL BUFFER CONTENT AFTER PROCESSING ', 'color: white; background-color: #483d8b; padding: 2px 6px; border-radius: 3px;');
      // console.log(this.actionBuffer);
      
      // Also show segmented view for better analysis
      if (this.actionBuffer.length > 0) {
        // console.log('%c BUFFER SEGMENTS AFTER PROCESSING ', 'color: white; background-color: #483d8b; padding: 2px 6px; border-radius: 3px;');
        // console.log('BEGINNING (first 100 chars):', this.actionBuffer.substring(0, 100));
        
        if (this.actionBuffer.length > 200) {
          // console.log('MIDDLE (middle 100 chars):', this.actionBuffer.substring(
          //   Math.floor(this.actionBuffer.length / 2) - 50, 
          //   Math.floor(this.actionBuffer.length / 2) + 50
          // ));
        }
        
        if (this.actionBuffer.length > 100) {
          // console.log('END (last 100 chars):', this.actionBuffer.substring(this.actionBuffer.length - 100));
        }
      }
      
      // console.groupEnd();
      
      // Log action status - only if we have meaningful info
      if (this.actionType) {
        // debugLog.action("STATUS", `Type: ${this.actionType}, Path: ${this.actionPath}, Progress: ${this.actionStarted ? 'UI showing' : 'detecting'}`);
      } else if (this.collectingAction) {
        // debugLog.action("STATUS", "Still collecting action data, type not determined yet");
      }
    }
    
    // Provide info about next chunk and queue status - only if relevant to actions
    if (this.queueLength > 0 && this.nextChunkPreview) {
      const nextChunkActionRelated = 
        this.nextChunkPreview.includes('"type": "action"') ||
        this.nextChunkPreview.includes('"command": "create"') ||
        this.nextChunkPreview.includes('"command": "str_replace"');
      
      if (this.collectingAction || nextChunkActionRelated) {
        // console.log(`%c ┌─ NEXT CHUNK PREVIEW ─┐ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
        // debugLog.info("QUEUE STATUS", `${this.queueLength} chunks remaining in queue`);
        // console.group('%c NEXT CHUNK CONTENT (EXPANDED) ', 'color: white; background-color: #ff8c00; padding: 2px 6px; border-radius: 3px;');
        // console.log(this.nextChunkPreview);
        // console.groupEnd();
        
        // Try to decode the next chunk's purpose - only for action-related info
        if (this.nextChunkPreview.includes('"type": "stream_end"') && this.collectingAction) {
          // debugLog.info("NEXT CHUNK", "Stream end marker");
        } else if (this.nextChunkPreview.includes('"delta"') && this.nextChunkPreview.includes('"type": "action"')) {
          // debugLog.info("NEXT CHUNK", "Action data (continuation or new)");
        } else if (nextChunkActionRelated) {
          // debugLog.info("NEXT CHUNK", "Action-related data");
        }
      }
    } else if (this.collectingAction) {
      // Only show this if we're collecting an action and need to know there's nothing next
      // debugLog.info("QUEUE EMPTY", "No more chunks in queue");
    }
    
    // Log current collection state - only for action collections
    if (this.collectingAction) {
      // debugLog.info("COLLECTION STATUS", "Expecting more chunks to complete this action");
    }
    
    // debugLog.separator();
    // console.log('\n\n');
  }
  
  /**
   * Detect the type of action from the current buffer
   */
  private detectActionType(): void {
    // If we have already started the UI based on early detection, we may only need to update path
    if (this.actionStarted) {
      // If we have command but missing path, check if path is now detectable
      if (this.actionData.command && (!this.actionData.path || !this.containerContent.includes('detected-path'))) {
        // Try to extract path from buffer using a more robust regex for Windows paths
        // This improved regex handles escaped backslashes and stops at the closing quote
        const pathMatch = this.actionBuffer.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (pathMatch && pathMatch[1]) {
          debugLog.parse("LATE PATH DETECTION", `Found path: "${pathMatch[1]}" after UI was started`);
          this.actionData.path = pathMatch[1];
          this.actionData.isPathComplete = true;
          this.actionPath = pathMatch[1]; // Backward compatibility
          
          // Check if we need to update UI with path
          if (!this.containerContent.includes('detected-path')) {
            debugLog.ui("PATH UI UPDATE NEEDED", "Updating UI with detected path");
            this.updateUIWithPath();
          }
        }
      }
      // Otherwise no detection needed, UI is already started
      return;
    }
    
    if (!this.actionBuffer) {
      // debugLog.info("DETECT SKIP", "No action buffer, skipping detection");
      return;
    }
    
    // Add clearer section header for action detection
    // console.log(`%c ┌─ ACTION DETECTION ATTEMPT ─┐ `, 'color: white; background-color: #20b2aa; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
    // debugLog.parse("DETECTING", `Buffer length: ${this.actionBuffer.length}, Chunk #${this.chunkSequence}`);
    // debugLog.jsonPreview("BUFFER CONTENT", this.actionBuffer);
    
    // First try to parse complete JSON
    try {
      // Try to parse the current buffer as JSON
      const actionObj = JSON.parse(this.actionBuffer);
      
      // console.log(`%c ✓ JSON PARSE SUCCESS `, 'color: white; background-color: #228b22; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
      // debugLog.success("JSON PARSED", "Successfully parsed complete JSON");
      // debugLog.jsonPreview("PARSED OBJECT", actionObj);
      
      // Update structured data
      if (actionObj.command) {
        this.actionData.command = actionObj.command;
        this.actionData.isCommandComplete = true;
        this.actionType = actionObj.command; // Backward compatibility
      }
      
      if (actionObj.path) {
        this.actionData.path = actionObj.path;
        this.actionData.isPathComplete = true;
        this.actionPath = actionObj.path; // Backward compatibility
      }
      
      // Check if we have enough information to determine the action type
      if (actionObj.command === 'create' && actionObj.path) {
        console.log(`%c ✓ CREATE ACTION DETECTED (JSON) `, 'color: white; background-color: #228b22; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
        debugLog.success("TYPE DETERMINED", `Full JSON: create action for path: ${this.actionPath}`);
        debugLog.ui("STARTING PROGRESSIVE", "Starting progressive UI from full JSON parse");
        
        // Start full UI with path
        this.startProgressiveAction();
        return;
      } else if (actionObj.command === 'str_replace' && actionObj.path) {
        console.log(`%c ✓ EDIT ACTION DETECTED (JSON) `, 'color: white; background-color: #228b22; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
        debugLog.success("TYPE DETERMINED", `Full JSON: edit action for path: ${this.actionPath}`);
        debugLog.ui("STARTING PROGRESSIVE", "Starting progressive UI from full JSON parse");
        
        // Start full UI with path
        this.startProgressiveAction();
        return;
      } else if (actionObj.command === 'view' && actionObj.path) {
        this.actionType = 'view'; 
        debugLog.info("VIEW ACTION", `Path: ${actionObj.path}`);
        // View actions don't need progressive updates, we'll wait for the full action
        return;
      } else if (actionObj.command === 'create' || actionObj.command === 'str_replace') {
        // We have command but no path yet - start early UI framework
        debugLog.ui("EARLY UI COMMAND ONLY", `Starting early UI framework for ${actionObj.command} without path`);
        this.startProgressiveUIFramework();
        return;
      } else {
        // debugLog.warning("UNKNOWN ACTION", `Command: ${actionObj.command}, Path: ${actionObj.path || 'not provided'}`);
      }
    } catch (e) {
      // JSON parsing failed, try regex-based detection for partial JSON
      // console.log(`%c ✗ JSON PARSE FAILED `, 'color: white; background-color: #dc143c; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
      // debugLog.warning("JSON PARSE FAILED", `Error: ${e.message}, trying regex fallback`);
    }
    
    // If JSON parsing failed, try to extract key information using regex
    // console.log(`%c ┌─ REGEX FALLBACK ATTEMPT ─┐ `, 'color: white; background-color: #ffd700; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
    // debugLog.parse("REGEX FALLBACK", "Attempting to extract command and path with regex");
    
    const commandMatch = this.actionBuffer.match(/"command"\s*:\s*"(create|str_replace|view)"/);
    // More robust path regex that handles escaped backslashes in Windows paths
    const pathMatch = this.actionBuffer.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    
    // Update structured data from regex
    if (commandMatch && commandMatch[1]) {
      // debugLog.parse("COMMAND MATCH", `Found command: "${commandMatch[1]}"`);
      this.actionData.command = commandMatch[1];
      this.actionData.isCommandComplete = true;
      this.actionType = commandMatch[1]; // Backward compatibility
      
      // If we find just a command for create/edit actions, we can start early UI
      if ((commandMatch[1] === 'create' || commandMatch[1] === 'str_replace') && !this.actionStarted) {
        // debugLog.ui("EARLY UI FROM REGEX", `Starting early UI framework for ${commandMatch[1]} from regex match`);
        this.startProgressiveUIFramework();
      }
    } else {
      // debugLog.error("COMMAND NOT FOUND", "Could not find command in action buffer");
    }
    
    if (pathMatch && pathMatch[1]) {
      // debugLog.parse("PATH MATCH", `Found path: "${pathMatch[1]}"`);
      this.actionData.path = pathMatch[1];
      this.actionData.isPathComplete = true;
      this.actionPath = pathMatch[1]; // Backward compatibility
      
      // If UI has started but path wasn't set yet, update it
      if (this.actionStarted) {
        this.updateUIWithPath();
      }
    } else {
      debugLog.error("PATH NOT FOUND", "Could not find path in action buffer");
    }
    
    // If we have both command and path and haven't started UI yet, start full UI
    if (commandMatch && commandMatch[1] && pathMatch && pathMatch[1] && !this.actionStarted) {
      if (commandMatch[1] === 'create') {
        console.log(`%c ✓ CREATE ACTION DETECTED (REGEX) `, 'color: white; background-color: #228b22; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
        debugLog.success("TYPE DETERMINED", `Regex: create action for path: ${this.actionPath}`);
        debugLog.ui("STARTING PROGRESSIVE", "Starting progressive UI from regex match");
        this.startProgressiveAction();
      } else if (commandMatch[1] === 'str_replace') {
        console.log(`%c ✓ EDIT ACTION DETECTED (REGEX) `, 'color: white; background-color: #228b22; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
        debugLog.success("TYPE DETERMINED", `Regex: edit action for path: ${this.actionPath}`);
        debugLog.ui("STARTING PROGRESSIVE", "Starting progressive UI from regex match");
        this.startProgressiveAction();
      } else if (commandMatch[1] === 'view') {
        this.actionType = 'view';
        debugLog.info("VIEW ACTION", `Path: ${pathMatch[1]}`);
        // View actions don't need progressive updates
      }
    } else if (!this.actionStarted) {
      debugLog.warning("INCOMPLETE INFO", "Not enough information to start full UI - waiting for more data");
    }
  }
  
  /**
   * Start showing a progressive action in the UI
   */
  private startProgressiveAction(): void {
    if (!this.actionType || this.actionStarted) {
      debugLog.warning("START SKIPPED", this.actionStarted 
        ? "Action UI already started" 
        : "No action type determined");
      return;
    }
    
    console.log(`%c ┌─ PROGRESSIVE UI CREATION ─┐ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
    debugLog.ui("START PROGRESSIVE", `Starting progressive UI for ${this.actionType} action`);
    
    // Collect action details
    let icon = '🔧';
    let title = 'System Action';
    let actionClass = 'action-block';
    
    if (this.actionType === 'create') {
      icon = '📄';
      title = 'Create File';
      actionClass = 'action-block action-create action-in-progress';
    } else if (this.actionType === 'str_replace') {
      icon = '✏️';
      title = 'Edit File';
      actionClass = 'action-block action-edit action-in-progress';
    }
    
    debugLog.ui("ACTION DETAILS", `Icon: ${icon}, Title: ${title}, Class: ${actionClass}`);
    
    // Create a progress indicator
    const progressIndicator = this.getProgressIndicator(5); // Start at 5%
    
    // Escape the path for safety in HTML
    const escapedPath = this.actionPath
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    debugLog.ui("PATH", `Original: ${this.actionPath}, Escaped: ${escapedPath}`);
    
    // Add a placeholder for this action that will be updated as chunks arrive
    const actionMarkup = `
      <span id="${this.actionId}" class="${actionClass}">
        <span class="action-container">
          <span class="action-header">
            <span class="action-icon" role="img" aria-label="${title}">${icon}</span>
            <span class="action-title">${title}</span>
            <span class="action-status">${progressIndicator}</span>
          </span>
          <span class="action-content">
            <span class="action-text">${this.actionType === 'create' ? 'Creating' : 'Editing'} file: ${escapedPath}</span>
            <div class="action-preview">
              <div class="action-preview-header">Current Progress:</div>
              <pre class="action-preview-content">Loading content...</pre>
            </div>
          </span>
        </span>
      </span>
    `;
    
    debugLog.ui("MARKUP CREATED", "Generated initial HTML markup for action UI");
    debugLog.ui("MARKUP PREVIEW", actionMarkup.substring(0, 100) + "...");
    
    this.containerContent += actionMarkup;
    this.actionStarted = true;
    
    console.log(`%c ✓ UI INITIALIZED `, 'color: white; background-color: #228b22; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
    debugLog.success("UI STARTED", `Progressive UI started for ${this.actionType} action on ${this.actionPath}`);
    
    // Show a summary of the action state
    console.log(`%c ACTION SUMMARY `, 'color: white; background-color: #4169e1; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
    console.log({
      actionId: this.actionId,
      type: this.actionType,
      path: this.actionPath,
      bufferSize: this.actionBuffer.length,
      chunkSequence: this.chunkSequence,
      isStarted: this.actionStarted
    });
    console.log(`%c └─ UI CREATION COMPLETE ─┘ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
  }
  
  /**
   * Starts minimal UI framework with only command information
   * This creates a basic UI placeholder that will be updated as more info arrives
   */
  private startProgressiveUIFramework(): void {
    if (this.actionStarted) {
      return;
    }
    
    // Generate a unique ID if none exists
    if (!this.actionId) {
      this.actionId = `action-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    
    const command = this.actionData.command || '';
    
    // Determine component type based on command
    let componentType: 'create' | 'edit' | 'system' = 'system';
    
    if (command === 'create') {
      componentType = 'create';
    } else if (command === 'str_replace') {
      componentType = 'edit';
    }
    
    // If we already have a path from early detection, use it right away
    let initialPath = undefined;
    let partialPath = undefined;
    
    if (this.actionData.path) {
      // We have a complete path
      initialPath = this.actionData.path;
    } else if (this.actionData.partialPath) {
      // We have a partial path
      partialPath = this.actionData.partialPath;
    } else {
      // Check if there's a path in the actionBuffer that we haven't extracted yet
      this.detectPath('');  // Run path detection on the current buffer
      
      if (this.actionData.path) {
        initialPath = this.actionData.path;
      } else if (this.actionData.partialPath) {
        partialPath = this.actionData.partialPath;
      }
    }
    
    // Create initial component state with path if available
    const newComponent: ActionComponentState = {
      id: this.actionId,
      type: componentType,
      status: initialPath ? 'in-progress' : (partialPath ? 'in-progress' : 'detecting'),
      path: initialPath, // May be undefined initially
      partialPath: partialPath, // Include partial path if available
      content: undefined,
      headerText: 'Waiting for details...',
      statusText: initialPath ? 
        `Collecting ${command === 'create' ? 'content' : 'changes'}...` : 
        (partialPath ? 'Collecting path...' : 'Detecting path...'),
      timestamp: Date.now()
    };
    
    // Store in component reference system
    this.actionComponents.set(this.actionId, newComponent);
    
    // Render component from state
    const markup = this.renderActionComponent(newComponent);
    
    // Add to container
    this.containerContent += markup;
    this.actionStarted = true;
    
    // For backward compatibility
    this.actionType = command;
    
    // console.log(`%c ✓ EARLY UI FRAMEWORK CREATED `, 'color: white; background-color: #228b22; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
    // debugLog.success("UI FRAMEWORK STARTED", `Early UI framework created for ${command} action`);
    // console.log(`%c └─ EARLY UI COMPLETE ─┘ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
  }
  
  /**
   * Escape HTML to prevent XSS
   * Central function for all HTML escaping to ensure consistency
   */
  private escapeHtml(text: string): string {
    if (!text) return '';
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  /**
   * Find all occurrences of a substring in a string
   * @param text The text to search in
   * @param substring The substring to find
   * @returns Array of starting indexes of all occurrences
   */
  private findAllIndexes(text: string, substring: string): number[] {
    const indexes: number[] = [];
    let index = text.indexOf(substring);
    
    while (index !== -1) {
      indexes.push(index);
      index = text.indexOf(substring, index + 1);
    }
    
    return indexes;
  }
  
  /**
   * Safely prepare path for display, handling escaping and length
   * Central function for all path display preparation
   */
  private formatPathForDisplay(path: string, isPartial: boolean = false): string {
    if (!path) return '';
    
    // Truncate very long paths for better display
    let displayPath = path;
    const MAX_PATH_LENGTH = 60;
    
    if (path.length > MAX_PATH_LENGTH) {
      // For long paths, keep start and end visible
      const start = path.substring(0, 20);
      const end = path.substring(path.length - 37);
      displayPath = `${start}...${end}`;
    }
    
    // Escape the path for safety
    const escapedPath = this.escapeHtml(displayPath);
    
    // Return the properly formatted HTML based on path completeness
    if (isPartial) {
      return `<span class="partial-path">${escapedPath}...</span>`;
    } else {
      return `<span class="detected-path">${escapedPath}</span>`;
    }
  }
  
  /**
   * Process escape sequences in a string to properly display content
   */
  private processEscapeSequences(str: string): string {
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
   * Render a component based on its state
   */
  private renderActionComponent(state: ActionComponentState): string {
    // Determine icon and classes based on component type
    let icon = '🔧';
    let title = 'System Action';
    
    if (state.type === 'create') {
      icon = '📄';
      title = 'Create File';
    } else if (state.type === 'edit') {
      icon = '✏️';
      title = 'Edit File';
    }
    
    // Build full class name
    const actionClass = `action-block action-${state.type} action-${state.status}`;
    
    // Path display handling
    let pathDisplay;
    if (state.path) {
      // Complete path using centralized formatting
      pathDisplay = this.formatPathForDisplay(state.path);
    } else if (state.partialPath) {
      // Partial path with ellipsis using centralized formatting
      pathDisplay = this.formatPathForDisplay(state.partialPath, true);
    } else {
      // No path yet
      pathDisplay = `<span class="detecting-path">detecting path...</span>`;
    }
    
    // Create markup
    return `
      <span id="${state.id}" class="${actionClass}">
        <span class="action-container">
          <span class="action-header">
            <span class="action-icon" role="img" aria-label="${title}">${icon}</span>
            <span class="action-title">${title}</span>
            <span class="action-status">${state.statusText}</span>
          </span>
          <span class="action-content">
            <span class="action-text">${state.type === 'create' ? 'Creating' : 'Editing'} file: ${pathDisplay}</span>
            <div class="action-preview">
              <div class="action-preview-header">${state.headerText}</div>
              ${state.content ? 
                state.content.trim().startsWith('<div class="action-diff">') ? 
                  state.content : 
                  `<pre class="action-preview-content">${state.content}</pre>` 
                : 
                '<pre class="action-preview-content">Collecting information...</pre>'
              }
            </div>
          </span>
        </span>
      </span>
    `;
  }
  
  /**
   * Find component by ID with reliable boundary detection
   * Uses a more robust approach that doesn't make assumptions about exact HTML structure
   */
  private findComponentMarkup(id: string): {markup: string, startIndex: number, endIndex: number} | null {
    // Escape special characters in ID to ensure regex safety
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create a pattern that finds any element with this ID
    const pattern = `<[^>]+id="${escapedId}"[\\s\\S]*?`;
    
    // Find the start of the component
    const startMatch = this.containerContent.match(new RegExp(pattern));
    if (!startMatch || startMatch.index === undefined) {
      return null;
    }
    
    // Get the start position of the component
    const startPos = startMatch.index;
    
    // Calculate nesting level to find the matching end tag
    let nesting = 1;
    let pos = startPos + startMatch[0].length;
    
    // Step through content to find the matching end tag
    while (nesting > 0 && pos < this.containerContent.length) {
      // Look for opening or closing span tags
      const openTag = this.containerContent.indexOf('<span', pos);
      const closeTag = this.containerContent.indexOf('</span>', pos);
      
      // If no more tags found or close tag not found, break
      if (closeTag === -1 || (openTag === -1 && closeTag === -1)) {
        break;
      }
      
      // If next tag is an opening tag
      if (openTag !== -1 && openTag < closeTag) {
        nesting++;
        pos = openTag + 5; // Move past this tag
      } 
      // If next tag is a closing tag
      else {
        nesting--;
        pos = closeTag + 7; // Move past this tag
      }
    }
    
    // If we successfully found the matching end tag
    if (nesting === 0) {
      const markup = this.containerContent.substring(startPos, pos);
      return {
        markup,
        startIndex: startPos,
        endIndex: pos
      };
    }
    
    // Fallback to a simple approach if balanced tags not found
    const simpleRegex = new RegExp(`(<[^>]+id="${escapedId}"[\\s\\S]*?action-container[\\s\\S]*?</span>)`, 's');
    const simpleMatch = this.containerContent.match(simpleRegex);
    
    if (simpleMatch && simpleMatch.index !== undefined) {
      return {
        markup: simpleMatch[0],
        startIndex: simpleMatch.index,
        endIndex: simpleMatch.index + simpleMatch[0].length
      };
    }
    
    return null;
  }
  
  /**
   * Update component with immutable pattern - this is the core method for UI updates
   */
  private updateComponent(id: string, updater: (state: ActionComponentState) => ActionComponentState): void {
    const component = this.actionComponents.get(id);
    if (!component) return;
    
    // Create updated state immutably
    const updatedComponent = updater({...component});
    this.actionComponents.set(id, updatedComponent);
    
    // Find and replace the entire component
    const componentInfo = this.findComponentMarkup(id);
    if (componentInfo) {
      const newMarkup = this.renderActionComponent(updatedComponent);
      this.containerContent = 
        this.containerContent.substring(0, componentInfo.startIndex) +
        newMarkup +
        this.containerContent.substring(componentInfo.endIndex);
    } else {
      // Fallback approach - try to update specific elements by class/pattern
      this.updateComponentWithFallback(updatedComponent);
    }
  }
  
  /**
   * Fallback method for updating components when direct component replacement fails
   * This handles specific updates for common state changes
   */
  private updateComponentWithFallback(component: ActionComponentState): void {
    // Only try fallback if we have a path - this is crucial for our use case
    if (component.path) {
      // Look for both detecting-path and existing detected-path spans to update
      const detectingPathPattern = /<span class="detecting-path">.*?<\/span>/;
      const detectedPathPattern = /<span class="detected-path">.*?<\/span>/;
      
      // Escape the path for safety
      const escapedPath = this.escapeHtml(component.path);
      const pathReplacement = `<span class="detected-path">${escapedPath}</span>`;
      
      // First try to replace detecting-path elements
      if (detectingPathPattern.test(this.containerContent)) {
        this.containerContent = this.containerContent.replace(
          detectingPathPattern,
          pathReplacement
        );
      } 
      // Then try to update any existing detected-path elements
      else if (detectedPathPattern.test(this.containerContent)) {
        this.containerContent = this.containerContent.replace(
          detectedPathPattern,
          pathReplacement
        );
      }
      
      // Update status messages
      if (component.status !== 'detecting') {
        // Update the status to reflect progress
        const statusPattern = /<span class="action-status">Detecting path...<\/span>/;
        if (statusPattern.test(this.containerContent)) {
          this.containerContent = this.containerContent.replace(
            statusPattern,
            `<span class="action-status">${component.statusText}</span>`
          );
        }
        
        // Update class to reflect progress
        this.containerContent = this.containerContent.replace(
          'action-detecting',
          `action-${component.status}`
        );
      }
    }
  }
  
  /**
   * Efficiently detects complete or partial path in current buffer/content
   * Returns true if path was found or updated
   */
  private detectPath(content: string): boolean {
    // Skip if we already have a complete path
    if (this.actionData.isPathComplete) {
      return false;
    }
    
    // Do quick check before applying regex
    if (content.indexOf('"path"') === -1 && !this.actionData.partialPath) {
      return false;
    }
    
    // Check if we now have a complete path in the buffer
    const pathIndex = this.actionBuffer.indexOf('"path"');
    if (pathIndex !== -1) {
      // Find the colon after "path"
      const colonPos = this.actionBuffer.indexOf(':', pathIndex);
      if (colonPos !== -1) {
        // Find the opening quote after the colon
        const quotePos = this.actionBuffer.indexOf('"', colonPos);
        if (quotePos !== -1) {
          // Find the closing quote position
          let closeQuotePos = -1;
          let searchPos = quotePos + 1;
          
          // Improved state machine to find closing quote (handles escaped quotes properly)
          let escapeActive = false;
          
          while (searchPos < this.actionBuffer.length) {
            const char = this.actionBuffer[searchPos];
            
            // Handle escape sequences properly
            if (char === '\\' && !escapeActive) {
              escapeActive = true;
              searchPos++;
              continue;
            }
            
            // Check for unescaped closing quote
            if (char === '"' && !escapeActive) {
              closeQuotePos = searchPos;
              break;
            }
            
            // Reset escape state and continue
            escapeActive = false;
            searchPos++;
          }
        
          // If we found both quotes, extract the path
          if (closeQuotePos !== -1) {
            const fullPath = this.actionBuffer.substring(quotePos + 1, closeQuotePos);
            
            // Only update if this is a new path
            if (!this.actionData.path || this.actionData.path !== fullPath) {
              this.actionData.path = fullPath;
              this.actionData.isPathComplete = true;
              this.actionPath = fullPath; // For backward compatibility
              
              // Clear partial path data
              delete this.actionData.partialPath;
              
              // Update UI if already started
              if (this.actionStarted) {
                this.updateUIWithPath();
              }
              return true;
            }
            return false; // Path already set to this value
          }
        }
      }
    }
    
    // No complete path found, check for partial path
    if (content.indexOf('"path"') !== -1) {
      // Find where the path starts in this chunk
      const chunkPathIndex = content.indexOf('"path"');
      if (chunkPathIndex !== -1) {
        const quotePos = content.indexOf('"', chunkPathIndex + 6);
        if (quotePos !== -1) {
          // Extract the partial path fragment
          const partialPath = content.substring(quotePos + 1);
          
          // Store partial path
          this.actionData.partialPath = partialPath;
          
          // Update UI with partial path if needed
          if (this.actionStarted) {
            this.updateUIWithPartialPath();
          }
          return true;
        }
      }
    } 
    // Check if this chunk continues a partial path
    else if (this.actionData.partialPath) {
      // Handle path continuation with proper quote detection
      let continuationPath = '';
      let foundEndQuote = false;
      let i = 0;
      
      // Process character by character to handle escaped quotes correctly
      let escapeActive = false;
      
      while (i < content.length) {
        const char = content[i];
        
        // Handle escape sequences properly
        if (char === '\\' && !escapeActive) {
          escapeActive = true;
          continuationPath += char;
          i++;
          continue;
        }
        
        // Check for unescaped closing quote
        if (char === '"' && !escapeActive) {
          foundEndQuote = true;
          break;
        }
        
        // Add character to continuation path
        continuationPath += char;
        
        // Reset escape state
        escapeActive = false;
        i++;
      }
      
      // Append the new path segment
      this.actionData.partialPath += continuationPath;
      
      // If we found the end quote, we have a complete path
      if (foundEndQuote) {
        this.actionData.path = this.actionData.partialPath;
        this.actionData.isPathComplete = true;
        this.actionPath = this.actionData.partialPath;
        
        // Clear partial path
        delete this.actionData.partialPath;
        
        // Update UI
        if (this.actionStarted) {
          this.updateUIWithPath();
        }
        return true;
      }
      
      // Still partial, update UI
      if (this.actionStarted) {
        this.updateUIWithPartialPath();
      }
      return true;
    }
    
    return false;
  }

  /**
   * Updates UI with partial path information
   */
  private updateUIWithPartialPath(): void {
    if (!this.actionStarted || !this.actionData.partialPath) {
      return;
    }
    
    // Format the partial path for display using centralized function
    const pathDisplay = this.formatPathForDisplay(this.actionData.partialPath, true);
    
    // Check if the container already has a path display
    if (this.containerContent.indexOf('detecting-path') !== -1) {
      // Replace detecting path with partial path - single operation
      this.containerContent = this.containerContent.replace(
        /<span class="detecting-path">.*?<\/span>/,
        pathDisplay
      );
    } else if (this.containerContent.indexOf('partial-path') !== -1) {
      // Update existing partial path - single operation
      this.containerContent = this.containerContent.replace(
        /<span class="partial-path">.*?<\/span>/,
        pathDisplay
      );
    }
    
    // Update status to in-progress, but scope it to the current component
    if (this.actionId) {
      // Find the component by ID to scope the update
      const componentIdMarker = `id="${this.actionId}"`;
      const componentStartIndex = this.containerContent.indexOf(componentIdMarker);
      
      if (componentStartIndex !== -1) {
        // Find the action-status within this component
        const componentEndIndex = this.containerContent.indexOf('</span></span></span>', componentStartIndex);
        if (componentEndIndex !== -1) {
          // Extract just this component's HTML
          const componentHTML = this.containerContent.substring(componentStartIndex, componentEndIndex);
          
          // Check if this component is in detecting state
          if (componentHTML.indexOf('action-detecting') !== -1) {
            // Find the status within this component's HTML
            const statusRelativeIndex = componentHTML.indexOf('<span class="action-status">');
            if (statusRelativeIndex !== -1) {
              // Calculate absolute index in the container
              const statusIndex = componentStartIndex + statusRelativeIndex;
              const statusEndIndex = this.containerContent.indexOf('</span>', statusIndex);
              
              if (statusEndIndex !== -1) {
                // Update only this component's status
                const statusText = 'Collecting path...';
                this.containerContent = 
                  this.containerContent.substring(0, statusIndex + 29) + 
                  statusText + 
                  this.containerContent.substring(statusEndIndex);
                
                // Also update this component's class if needed
                const classPattern = new RegExp(`id="${this.actionId}"[^>]*class="[^"]*action-detecting[^"]*"`, 'i');
                if (classPattern.test(this.containerContent)) {
                  this.containerContent = this.containerContent.replace(
                    classPattern,
                    match => match.replace('action-detecting', 'action-in-progress')
                  );
                }
              }
            }
          }
        }
      }
    }
    
    // Update component if available
    const component = this.actionComponents.get(this.actionId);
    if (component) {
      this.updateComponent(this.actionId, state => ({
        ...state,
        partialPath: this.actionData.partialPath,
        status: 'in-progress',
        statusText: 'Collecting path...'
      }));
    }
  }

  /**
   * Updates the UI with complete path information
   */
  private updateUIWithPath(): void {
    if (!this.actionStarted || !this.actionData.path) {
      return;
    }
    
    // Store for backward compatibility
    this.actionPath = this.actionData.path;
    
    // Create status text for UI update
    const statusText = `Collecting ${this.actionData.command === 'create' ? 'content' : 'changes'}...`;
    
    // Use centralized function to format path
    const pathReplacement = this.formatPathForDisplay(this.actionData.path);
    
    // Track if any updates were made to minimize DOM operations
    let updated = false;
    
    // Use a single update approach for all path displays with global replacement
    const pathPatternsToUpdate = [
      { pattern: 'detecting-path', 
        find: (content) => this.findAllIndexes(content, '<span class="detecting-path">') },
      { pattern: 'partial-path', 
        find: (content) => this.findAllIndexes(content, '<span class="partial-path">') }
    ];
    
    // For each pattern, find all occurrences and replace them
    for (const { pattern, find } of pathPatternsToUpdate) {
      if (this.containerContent.indexOf(pattern) !== -1) {
        // Find all occurrences of this pattern
        const indexes = find(this.containerContent);
        
        // Replace all occurrences, working backwards to maintain indexes
        for (let i = indexes.length - 1; i >= 0; i--) {
          const startIndex = indexes[i];
          const endTagIndex = this.containerContent.indexOf('</span>', startIndex);
          
          if (endTagIndex !== -1) {
            this.containerContent = 
              this.containerContent.substring(0, startIndex) +
              pathReplacement +
              this.containerContent.substring(endTagIndex + 7); // 7 = length of '</span>'
            
            updated = true;
          }
        }
      }
    }
    
    // For detected-path, only update if the content actually changed
    if (this.containerContent.indexOf('detected-path') !== -1 && 
        !this.containerContent.includes(pathReplacement)) {
      
      // Find all occurrences of detected-path
      const detectedIndexes = this.findAllIndexes(this.containerContent, '<span class="detected-path">');
      
      // Replace all detected-path tags, working backwards to maintain indexes
      for (let i = detectedIndexes.length - 1; i >= 0; i--) {
        const startIndex = detectedIndexes[i];
        const endTagIndex = this.containerContent.indexOf('</span>', startIndex);
        
        if (endTagIndex !== -1) {
          this.containerContent = 
            this.containerContent.substring(0, startIndex) +
            pathReplacement +
            this.containerContent.substring(endTagIndex + 7);
          
          updated = true;
        }
      }
    }
    
    // Update status text if needed, but scope it to the current component
    if (updated && this.actionId) {
      // Find the component by ID to scope the update
      const componentIdMarker = `id="${this.actionId}"`;
      const componentStartIndex = this.containerContent.indexOf(componentIdMarker);
      
      if (componentStartIndex !== -1) {
        // Find the action-status within this component
        const componentEndIndex = this.containerContent.indexOf('</span></span></span>', componentStartIndex);
        if (componentEndIndex !== -1) {
          // Extract just this component's HTML
          const componentHTML = this.containerContent.substring(componentStartIndex, componentEndIndex);
          
          // Find the status within this component's HTML
          const statusRelativeIndex = componentHTML.indexOf('<span class="action-status">');
          if (statusRelativeIndex !== -1) {
            // Calculate absolute index in the container
            const statusIndex = componentStartIndex + statusRelativeIndex;
            const statusEndIndex = this.containerContent.indexOf('</span>', statusIndex);
            
            if (statusEndIndex !== -1) {
              // Update only this component's status
              this.containerContent = 
                this.containerContent.substring(0, statusIndex + 29) + 
                statusText + 
                this.containerContent.substring(statusEndIndex);
              
              // Also update this component's class if needed
              const classPattern = new RegExp(`id="${this.actionId}"[^>]*class="[^"]*action-detecting[^"]*"`, 'i');
              if (classPattern.test(this.containerContent)) {
                this.containerContent = this.containerContent.replace(
                  classPattern,
                  match => match.replace('action-detecting', 'action-in-progress')
                );
              }
            }
          }
        }
      }
    }
    
    // Update component state efficiently
    const component = this.actionComponents.get(this.actionId);
    
    if (component) {
      // Only update if path has changed
      if (component.path !== this.actionData.path) {
        this.updateComponent(this.actionId, state => ({
          ...state,
          path: this.actionData.path,
          status: 'in-progress',
          statusText: statusText
        }));
      }
    } 
    // If no component exists but we have an actionId, create one
    else if (this.actionId) {
      // Create a temporary component state for the fallback update
      const tempComponent: ActionComponentState = {
        id: this.actionId,
        type: this.actionData.command === 'create' ? 'create' : 'edit',
        status: 'in-progress',
        path: this.actionData.path,
        content: undefined,
        headerText: 'Waiting for content...',
        statusText: statusText,
        timestamp: Date.now()
      };
      
      // Add to component map and try to update
      this.actionComponents.set(this.actionId, tempComponent);
      this.updateComponentWithFallback(tempComponent);
    }
    
    // console.log(`%c ✓ PATH UPDATED IN UI `, 'color: white; background-color: #228b22; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
    // debugLog.success("PATH UPDATED", `UI updated with path: ${this.actionData.path}`);
    // console.log(`%c └─ PATH UPDATE COMPLETE ─┘ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
  }
  
  /**
   * Generate a progress indicator string based on percentage
   */
  private getProgressIndicator(percent: number): string {
    const completeBars = Math.floor(percent / 10); // Each bar represents 10%
    const remainingBars = 10 - completeBars;
    
    return `[${'█'.repeat(completeBars)}${' '.repeat(remainingBars)}] ${percent}%`;
  }
  
  /**
   * Update the progressive action in the string-based HTML
   */
  private updateProgressiveAction(): void {
    if (!this.actionStarted || !this.actionId) {
      // debugLog.warning("UPDATE SKIPPED", !this.actionStarted 
      //   ? "Action UI not started yet" 
      //   : "No action ID available");
      return;
    }
    
    // debugLog.ui("UPDATE PROGRESSIVE", `Updating UI for ${this.actionType} action`);
    // debugLog.buffer("CURRENT", `Buffer size: ${this.actionBuffer.length} chars`);
    
    try {
      // Try to parse the current buffer
      // debugLog.parse("ATTEMPT", "Trying to parse action buffer as JSON");
      const actionObj = JSON.parse(this.actionBuffer);
      
      // debugLog.success("PARSE SUCCESS", "Successfully parsed action buffer");
      // debugLog.jsonPreview("ACTION OBJECT", actionObj);
      
      // Update the structured action data
      if (actionObj.command && (!this.actionData.command || !this.actionData.isCommandComplete)) {
        this.actionData.command = actionObj.command;
        this.actionData.isCommandComplete = true;
        this.actionType = actionObj.command; // Backward compatibility
      }
      
      if (actionObj.path && (!this.actionData.path || !this.actionData.isPathComplete)) {
        this.actionData.path = actionObj.path;
        this.actionData.isPathComplete = true;
        this.actionPath = actionObj.path; // Backward compatibility
        
        // Update UI immediately with the detected path - always
        this.updateUIWithPath();
      }
      
      // Calculate progress percentage
      let percentComplete = 0;
      let previewHtml = '';
      
      if (this.actionType === 'create' && actionObj.file_text) {
        // Get previous content length to check if we need to update UI
        const previousContentLength = this.actionData.file_text ? this.actionData.file_text.length : 0;
        
        // Update structured data for file content
        this.actionData.file_text = actionObj.file_text;
        this.actionData.isContentStarted = true;
        
        // Get current component
        const component = this.actionComponents.get(this.actionId);
        
        // Process content for display
        let processedText = actionObj.file_text;
        
        // For file creation, show the current file content with line limit
        const lines = processedText.split('\n');
        const previewText = lines.slice(0, Math.min(10, lines.length)).join('\n');
        const remainingLines = lines.length > 10 ? `\n(+ ${lines.length - 10} more lines)` : '';
        
        // Calculate progress based on buffer size and content length
        percentComplete = Math.min(100, Math.round((this.actionBuffer.length / (actionObj.file_text.length * 2)) * 100));
        
        // Format the preview content
        previewHtml = `<pre class="action-preview-content">${previewText}${remainingLines}</pre>`;
        
        // Update component with new content and progress if we have one
        if (component) {
          this.updateComponent(this.actionId, state => ({
            ...state,
            content: previewText + remainingLines,
            headerText: 'Content Preview:',
            statusText: `Content collected (${percentComplete}%)`,
            path: this.actionData.path || state.path // Ensure path is preserved
          }));
        } else {
          // If no component exists, fall back to old approach
          // Check if we need to update the header (first time we get content)
          if (previousContentLength === 0) {
            // If this is the first time we have content, update the header too
            const headerPattern = /<div class="action-preview-header">.*?<\/div>/;
            if (headerPattern.test(this.containerContent)) {
              debugLog.ui("HEADER UPDATE", "Updating preview header from JSON parse path");
              this.containerContent = this.containerContent.replace(
                headerPattern,
                `<div class="action-preview-header">Content Preview:</div>`
              );
            }
          }
        }
        
        // debugLog.ui("PROGRESS", `${percentComplete}% complete (buffer: ${this.actionBuffer.length}, content: ${actionObj.file_text.length})`);
        // debugLog.actionProgress(this.actionId, "create", percentComplete, previewText);
      } 
      else if (this.actionType === 'str_replace' && actionObj.old_str && actionObj.new_str) {
        // Update structured data for edit content
        this.actionData.old_str = actionObj.old_str;
        this.actionData.new_str = actionObj.new_str;
        this.actionData.isContentStarted = true;
        
        // Get current component
        const component = this.actionComponents.get(this.actionId);
        
        // Process escape sequences for proper display
        const processedOldText = this.escapeHtml(this.processEscapeSequences(actionObj.old_str));
        const processedNewText = this.escapeHtml(this.processEscapeSequences(actionObj.new_str));
        
        // For file editing, generate a properly formatted diff view
        previewHtml = `<div class="action-diff">
  <div class="action-diff-old">
    <div class="action-diff-header">Original</div>
    <pre class="action-diff-content">${processedOldText}</pre>
  </div>
  <div class="action-diff-new">
    <div class="action-diff-header">Modified</div>
    <pre class="action-diff-content">${processedNewText}</pre>
  </div>
</div>`;
        
        // Calculate progress based on buffer size relative to content size
        percentComplete = calculateStrReplaceProgress(this.actionBuffer, actionObj.old_str, actionObj.new_str);
        
        // Update status text with progress
        const statusText = `Both original and modified content collected (${percentComplete}%)`;
        
        // Update component with new content and progress
        if (component) {
          this.updateComponent(this.actionId, state => ({
            ...state,
            content: previewHtml,
            headerText: 'Complete Changes:',
            statusText: statusText,
            path: this.actionData.path || state.path // Ensure path is preserved
          }));
        } else {
          // Fall back to old approach - manually update the HTML
          // Update the preview content in the DOM string
          const previewPattern = /<pre class="action-preview-content">.*?<\/pre>/s;
          if (previewPattern.test(this.containerContent)) {
            this.containerContent = this.containerContent.replace(
              previewPattern,
              previewHtml
            );
          }
          
          // Update status
          const statusPattern = /<span class="action-status">[^<]*<\/span>/;
          this.containerContent = this.containerContent.replace(
            statusPattern,
            `<span class="action-status">${statusText}</span>`
          );
        }
      } else {
        debugLog.warning("MISSING CONTENT", "Action object is missing required content properties");
        if (this.actionType === 'create') {
          debugLog.warning("CREATE MISSING", "file_text property is missing");
        } else if (this.actionType === 'str_replace') {
          debugLog.warning("EDIT MISSING", `old_str: ${!!actionObj.old_str}, new_str: ${!!actionObj.new_str}`);
        }
      }
      
      // Only update if we have meaningful content to display
      if (previewHtml) {
        debugLog.ui("CONTENT READY", "Preparing to update UI with new content");
        
        // Get the progress indicator
        const progressIndicator = this.getProgressIndicator(percentComplete);
        
        // Create a new action markup with updated content
        const updatedActionMarkup = `
          <span id="${this.actionId}" class="action-block ${this.actionType === 'create' ? 'action-create' : 'action-edit'} action-in-progress">
            <span class="action-container">
              <span class="action-header">
                <span class="action-icon" role="img" aria-label="${this.actionType === 'create' ? 'Create File' : 'Edit File'}">
                  ${this.actionType === 'create' ? '📄' : '✏️'}
                </span>
                <span class="action-title">${this.actionType === 'create' ? 'Create File' : 'Edit File'}</span>
                <span class="action-status">${progressIndicator}</span>
              </span>
              <span class="action-content">
                <span class="action-text">${this.actionType === 'create' ? 'Creating' : 'Editing'} file: ${this.actionPath}</span>
                <div class="action-preview">
                  <div class="action-preview-header">Current Progress:</div>
                  ${previewHtml}
                </div>
              </span>
            </span>
          </span>
        `;
        
        // Try two approaches to update the UI
        // debugLog.ui("FINAL UPDATE", "Attempting to update UI with complete action data");
        
        // Approach 1: Try to replace the entire action element (preferred)
        const actionRegex = new RegExp(`<span id="${this.actionId}"[^>]*>.*?<\\/span><\\/span><\\/span>`, 's');
        
        if (actionRegex.test(this.containerContent)) {
          // debugLog.ui("REPLACING", "Found existing action markup, replacing with updated version");
          // Replace the existing action markup with our updated version
          this.containerContent = this.containerContent.replace(actionRegex, updatedActionMarkup);
          // debugLog.success("UI UPDATED", `Updated progress to ${percentComplete}%`);
        } else {
          // debugLog.warning("FULL REPLACE FAILED", "Could not find complete action element, trying targeted updates");
          
          // Approach 2: Fall back to targeted updates of individual elements
          let updated = false;
          
          // Update just the preview content
          const previewPattern = /<pre class="action-preview-content">.*?<\/pre>/s;
          if (previewPattern.test(this.containerContent)) {
            // debugLog.ui("CONTENT UPDATE", "Updating just the preview content area");
            this.containerContent = this.containerContent.replace(
              previewPattern,
              previewHtml
            );
            updated = true;
          }
          
          // Update the status to show progress
          const statusPattern = /<span class="action-status">[^<]*<\/span>/;
          if (statusPattern.test(this.containerContent)) {
            // debugLog.ui("STATUS UPDATE", `Updating status to show progress: ${progressIndicator}`);
            this.containerContent = this.containerContent.replace(
              statusPattern,
              `<span class="action-status">${progressIndicator}</span>`
            );
            updated = true;
          }
          
          // Update the header text if needed
          const headerPattern = /<div class="action-preview-header">.*?<\/div>/;
          if (headerPattern.test(this.containerContent)) {
            this.containerContent = this.containerContent.replace(
              headerPattern,
              `<div class="action-preview-header">Complete Content:</div>`
            );
            updated = true;
          }
          
          /* if (updated) {
            debugLog.success("PARTIAL UPDATES", "Successfully applied targeted updates to UI elements");
          } else {
            debugLog.error("ALL UPDATES FAILED", "Could not update either the full action or individual elements");
            debugLog.jsonPreview("CONTAINER EXCERPT", this.containerContent.substring(0, 200) + "...");
            // Log what we're looking for vs what's in the container
            debugLog.jsonPreview("ACTION ID", this.actionId);
            debugLog.jsonPreview("REGEX PATTERN", actionRegex.toString());
          } */
        }
      } else {
        // debugLog.warning("NO PREVIEW", "No preview HTML was generated, skipping UI update");
      }
    } catch (e) {
      // If any errors occur during update, try to recover what we can
      // debugLog.error("UPDATE ERROR", `Error updating progressive action: ${e.message}`);
      // debugLog.jsonPreview("BUFFER STATE", this.actionBuffer);
      
      // Even if JSON parsing fails, try to extract path with regex if we don't have it yet
      if (this.actionStarted && !this.actionData.path) {
        // Use the more robust regex for Windows paths
        const pathMatch = this.actionBuffer.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (pathMatch && pathMatch[1]) {
          console.log(`Path detected in streamStates (fallback regex): ${pathMatch[1]}`);
          this.actionData.path = pathMatch[1];
          this.actionData.isPathComplete = true;
          this.actionPath = pathMatch[1]; // Backward compatibility
          
          // Update UI with the path
          this.updateUIWithPath();
        }
      }
      
      // If action is a create and we have file_text content but haven't extracted it yet
      if (this.actionType === 'create') {
        const fileTextMatch = this.actionBuffer.match(/"file_text"\s*:\s*"((?:[^"\\]|\\.)*)/);
        if (fileTextMatch && fileTextMatch[1]) {
          // Check if this is new content or more content than we already had
          const newContent = fileTextMatch[1];
          
          // Only update if we don't have content yet or we have more content now
          if (!this.actionData.file_text || newContent.length > this.actionData.file_text.length) {
            debugLog.success("CONTENT FOUND", `Found file_text in buffer: "${newContent}"`);
            this.actionData.file_text = newContent;
            this.actionData.isContentStarted = true;
            
            // Update UI with content preview
            debugLog.ui("CONTENT UPDATE", `Updating UI with content preview: "${newContent}"`);
            
            // Process content for display - handle escape sequences
            let processedText = newContent;
            
            // Process escape sequences correctly (\n, \t, \", etc.)
            try {
              // Using a trick: we parse as JSON to convert escape sequences
              processedText = JSON.parse(`"${newContent.replace(/"/g, '\\"')}"`);
              debugLog.success("ESCAPE SEQUENCES", "Successfully processed escape sequences in content");
            } catch (e) {
              // If that fails, fall back to direct display with basic replacements
              debugLog.warning("ESCAPE PROCESSING", `Could not parse escape sequences: ${e.message}`);
              
              // Manual replacements for common escape sequences
              processedText = newContent
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\\'/g, "'")
                .replace(/\\\\/g, '\\');
            }
            
            // Prepare preview HTML with processed text
            const previewText = processedText;
            const previewHtml = `<pre class="action-preview-content">${previewText}</pre>`;
            
            // Update the preview content in the DOM string
            const previewPattern = /<pre class="action-preview-content">.*?<\/pre>/s;
            if (previewPattern.test(this.containerContent)) {
              this.containerContent = this.containerContent.replace(
                previewPattern,
                previewHtml
              );
              debugLog.success("PREVIEW UPDATED", "Content preview area updated with new content");
            } else {
              debugLog.error("PREVIEW NOT FOUND", "Could not find preview area in HTML");
            }
            
            // Also update the header to indicate content is now available
            const headerPattern = /<div class="action-preview-header">.*?<\/div>/;
            if (headerPattern.test(this.containerContent)) {
              this.containerContent = this.containerContent.replace(
                headerPattern,
                `<div class="action-preview-header">Content Preview:</div>`
              );
              debugLog.success("HEADER UPDATED", "Preview header updated to show content is available");
            }
          }
        }
      }
      // If action is str_replace (edit) and we need to extract old_str and new_str
      else if (this.actionType === 'str_replace') {
        // Use the extracted functionality for str_replace processing
        const result = processStrReplace(this.actionBuffer, this.containerContent, this.actionData);
        
        // Update container content and action data with results
        this.containerContent = result.containerContent;
        this.actionData = result.actionData;
      }
      // If action is insert and we need to extract insert_line and new_str
      else if (this.actionType === 'insert') {
        // Check for insert_line and new_str separately to enable progressive updates
        const insertLineMatch = this.actionBuffer.match(/"insert_line"\s*:\s*(\d+)/);
        const newStrMatch = this.actionBuffer.match(/"new_str"\s*:\s*"((?:[^"\\]|\\.)*)/);
        
        // Track if any UI updates were made
        let contentUpdated = false;
        
        // CASE 1: We have both insert_line and new_str - show complete insert view
        if (insertLineMatch && insertLineMatch[1] && newStrMatch && newStrMatch[1]) {
          const insertLine = parseInt(insertLineMatch[1], 10);
          const newContent = newStrMatch[1];
          
          const haveNewData = 
            !this.actionData.insert_line || 
            !this.actionData.new_str ||
            newContent.length > (this.actionData.new_str?.length || 0);
            
          if (haveNewData) {
            debugLog.success("COMPLETE INSERT", `Found insert_line (${insertLine}) and content (${newContent.length} chars)`);
            
            // Update our structured data
            this.actionData.insert_line = insertLine;
            this.actionData.new_str = newContent;
            this.actionData.isContentStarted = true;
            this.actionData.isInsertLineDetected = true;
            
            // Update UI with insert preview
            console.log(`%c ┌─ COMPLETE INSERT UI UPDATE ─┐ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
            debugLog.ui("COMPLETE INSERT", `Updating UI with full insert view`);
            
            // Process escape sequences for content
            let processedContent = newContent;
            
            try {
              // Process escape sequences
              processedContent = JSON.parse(`"${newContent.replace(/"/g, '\\"')}"`);
              debugLog.success("ESCAPE SEQUENCES", "Successfully processed escape sequences in insert content");
            } catch (e) {
              // Manual replacements if JSON parsing fails
              debugLog.warning("ESCAPE PROCESSING", `Could not parse escape sequences: ${e.message}`);
              
              // Process content
              processedContent = newContent
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\\'/g, "'")
                .replace(/\\\\/g, '\\');
            }
            
            // Prepare insert view HTML
            const insertHtml = `
              <div class="action-insert">
                <div class="action-insert-location">
                  <div class="action-insert-header">Inserting at Line</div>
                  <div class="action-insert-line">${insertLine}</div>
                </div>
                <div class="action-insert-content">
                  <div class="action-insert-header">Content</div>
                  <pre class="action-insert-text">${processedContent}</pre>
                </div>
              </div>
            `;
            
            // Check if we already have an insert view
            const hasInsertView = this.containerContent.includes('action-insert-content');
            
            if (hasInsertView) {
              // If insert view exists, just update the content part
              const contentPattern = /<pre class="action-insert-text">[\s\S]*?<\/pre>/;
              
              if (contentPattern.test(this.containerContent)) {
                // Replace just the content pre element
                this.containerContent = this.containerContent.replace(
                  contentPattern,
                  `<pre class="action-insert-text">${processedContent}</pre>`
                );
                debugLog.success("CONTENT UPDATED", "Insert content updated in existing view");
              } else {
                debugLog.error("CONTENT AREA NOT FOUND", "Could not find content section in insert view");
              }
            } else {
              // If no insert view exists yet, create one
              const previewPattern = /<pre class="action-preview-content">.*?<\/pre>/s;
              
              if (previewPattern.test(this.containerContent)) {
                // Replace the placeholder preview with insert view
                this.containerContent = this.containerContent.replace(
                  previewPattern,
                  insertHtml
                );
                debugLog.success("PREVIEW REPLACED", "Placeholder preview replaced with insert view");
              } else {
                debugLog.error("TARGET NOT FOUND", "Could not find preview area in HTML");
              }
            }
            
            // Update status to show we have both parts
            const statusPattern = /<span class="action-status">[^<]*<\/span>/;
            if (statusPattern.test(this.containerContent)) {
              this.containerContent = this.containerContent.replace(
                statusPattern,
                `<span class="action-status">Insert location and content collected</span>`
              );
              debugLog.success("STATUS UPDATED", "Status updated to show all insert details collected");
            }
            
            // Update header to show we have complete insert
            const headerPattern = /<div class="action-preview-header">.*?<\/div>/;
            if (headerPattern.test(this.containerContent)) {
              this.containerContent = this.containerContent.replace(
                headerPattern,
                `<div class="action-preview-header">Content to Insert:</div>`
              );
              debugLog.success("HEADER UPDATED", "Header updated to show complete insert details");
            }
            
            contentUpdated = true;
            console.log(`%c └─ INSERT UPDATE COMPLETE ─┘ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
          }
        }
        // CASE 2: We have only insert_line - show partial update
        else if (insertLineMatch && insertLineMatch[1] && !this.actionData.isInsertLineDetected) {
          const insertLine = parseInt(insertLineMatch[1], 10);
          
          debugLog.success("PARTIAL INSERT", `Found only insert_line (${insertLine}), waiting for content`);
          
          // Update our structured data
          this.actionData.insert_line = insertLine;
          this.actionData.isInsertLineDetected = true;
          
          // Update UI with insert line info
          console.log(`%c ┌─ PARTIAL INSERT UI UPDATE ─┐ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
          debugLog.ui("INSERT LINE", `Updating UI with insert line information`);
          
          // Show insert line in the preview area
          const previewHtml = `<pre class="action-preview-content">Will insert at line: ${insertLine}</pre>`;
          
          // Update the preview content in the DOM string
          const previewPattern = /<pre class="action-preview-content">.*?<\/pre>/s;
          if (previewPattern.test(this.containerContent)) {
            this.containerContent = this.containerContent.replace(
              previewPattern,
              previewHtml
            );
            debugLog.success("PREVIEW UPDATED", "Preview updated with insert line");
          } else {
            debugLog.error("PREVIEW NOT FOUND", "Could not find preview area in HTML");
          }
          
          // Update status to show we've got insert line
          const statusPattern = /<span class="action-status">[^<]*<\/span>/;
          if (statusPattern.test(this.containerContent)) {
            this.containerContent = this.containerContent.replace(
              statusPattern,
              `<span class="action-status">Insert line detected, waiting for content...</span>`
            );
            debugLog.success("STATUS UPDATED", "Status updated to show insert line detected");
          }
          
          // Update header to show progress
          const headerPattern = /<div class="action-preview-header">.*?<\/div>/;
          if (headerPattern.test(this.containerContent)) {
            this.containerContent = this.containerContent.replace(
              headerPattern,
              `<div class="action-preview-header">Insert Location Detected:</div>`
            );
            debugLog.success("HEADER UPDATED", "Header updated to show insert location available");
          }
          
          contentUpdated = true;
          console.log(`%c └─ PARTIAL UPDATE COMPLETE ─┘ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
        }
        // CASE 3: We have only new_str - show partial update
        else if (newStrMatch && newStrMatch[1] && (!this.actionData.new_str || newStrMatch[1].length > this.actionData.new_str.length)) {
          const newContent = newStrMatch[1];
          
          debugLog.success("PARTIAL INSERT", `Found only content (${newContent.length} chars), waiting for insert line`);
          
          // Update our structured data
          this.actionData.new_str = newContent;
          this.actionData.isContentStarted = true;
          
          // Update UI with content preview
          console.log(`%c ┌─ PARTIAL INSERT UI UPDATE ─┐ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
          debugLog.ui("INSERT CONTENT", `Updating UI with insert content preview`);
          
          // Process escape sequences for content
          let processedContent = newContent;
          
          try {
            // Process escape sequences
            processedContent = JSON.parse(`"${newContent.replace(/"/g, '\\"')}"`);
            debugLog.success("ESCAPE SEQUENCES", "Successfully processed escape sequences in insert content");
          } catch (e) {
            // Manual replacements if JSON parsing fails
            debugLog.warning("ESCAPE PROCESSING", `Could not parse escape sequences: ${e.message}`);
            
            // Process content
            processedContent = newContent
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\'/g, "'")
              .replace(/\\\\/g, '\\');
          }
          
          // Show content in the preview area
          const previewHtml = `<pre class="action-preview-content">Content to insert: ${processedContent}</pre>`;
          
          // Update the preview content in the DOM string
          const previewPattern = /<pre class="action-preview-content">.*?<\/pre>/s;
          if (previewPattern.test(this.containerContent)) {
            this.containerContent = this.containerContent.replace(
              previewPattern,
              previewHtml
            );
            debugLog.success("PREVIEW UPDATED", "Preview updated with insert content");
          } else {
            debugLog.error("PREVIEW NOT FOUND", "Could not find preview area in HTML");
          }
          
          // Update status to show we've got content
          const statusPattern = /<span class="action-status">[^<]*<\/span>/;
          if (statusPattern.test(this.containerContent)) {
            this.containerContent = this.containerContent.replace(
              statusPattern,
              `<span class="action-status">Content collected, waiting for insert location...</span>`
            );
            debugLog.success("STATUS UPDATED", "Status updated to show content collected");
          }
          
          // Update header to show progress
          const headerPattern = /<div class="action-preview-header">.*?<\/div>/;
          if (headerPattern.test(this.containerContent)) {
            this.containerContent = this.containerContent.replace(
              headerPattern,
              `<div class="action-preview-header">Content Collected:</div>`
            );
            debugLog.success("HEADER UPDATED", "Header updated to show content available");
          }
          
          contentUpdated = true;
          console.log(`%c └─ PARTIAL UPDATE COMPLETE ─┘ `, 'color: white; background-color: #ff8c00; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
        }
        
        // Only log if nothing was updated and content is present
        if (!contentUpdated && (insertLineMatch || newStrMatch)) {
          debugLog.info("NO UI UPDATE", `Content detected but no UI update criteria met`);
          if (insertLineMatch && insertLineMatch[1]) debugLog.info("INSERT LINE FOUND", `Line: ${insertLineMatch[1]}`);
          if (newStrMatch && newStrMatch[1]) debugLog.info("NEW STR FOUND", `Length: ${newStrMatch[1].length}`);
          if (this.actionData.insert_line) debugLog.info("STORED INSERT LINE", `Line: ${this.actionData.insert_line}`);
          if (this.actionData.new_str) debugLog.info("STORED NEW STR", `Length: ${this.actionData.new_str?.length || 0}`);
        }
      }
    }
  }

  /**
   * Flush the action buffer and format it
   * @returns Whether an action was flushed
   */
  private flushActionBuffer(): boolean {
    // Only log if we actually have an action buffer to flush
    if (this.collectingAction && this.actionBuffer) {
      // debugLog.separator();
      // debugLog.action("FLUSH", `Flushing action buffer with ${this.actionBuffer.length} chars`);
      // debugLog.info("ACTION STATE", `Type: ${this.actionType}, Path: ${this.actionPath}, UI Started: ${this.actionStarted}`);
      // debugLog.jsonPreview("FINAL BUFFER", this.actionBuffer);
      
      if (this.actionStarted) {
        // debugLog.ui("FINALIZING", "Completing the progressive UI for this action");
        
        // If we've been showing progressive updates, finalize the UI by updating our HTML string
        try {
          // Replace the in-progress class with complete class in the action HTML
          const inProgressClass = this.actionType === 'create' ? 'action-create action-in-progress' : 'action-edit action-in-progress';
          const completeClass = this.actionType === 'create' ? 'action-create action-complete' : 'action-edit action-complete';
          
          // debugLog.ui("STYLE UPDATE", `Changing class from "${inProgressClass}" to "${completeClass}"`);
          
          // Replace class in HTML string
          const beforeLength = this.containerContent.length;
          this.containerContent = this.containerContent.replace(inProgressClass, completeClass);
          const classReplaced = beforeLength !== this.containerContent.length;
          
          if (classReplaced) {
            // debugLog.success("CLASS REPLACED", "Successfully replaced in-progress class with complete class");
          } else {
            // debugLog.error("CLASS REPLACE FAILED", `Could not find "${inProgressClass}" in the HTML`);
            // debugLog.jsonPreview("HTML EXCERPT", this.containerContent.substring(0, 300) + "...");
          }
          
          // Replace the status indicator with a completion message
          const statusRegex = /<span class="action-status">.*?<\/span>/;
          const beforeStatusLength = this.containerContent.length;
          this.containerContent = this.containerContent.replace(statusRegex, '<span class="action-status">✓ Complete</span>');
          const statusReplaced = beforeStatusLength !== this.containerContent.length;
          
          if (statusReplaced) {
            // debugLog.success("STATUS REPLACED", "Successfully replaced status indicator with completion message");
          } else {
            // debugLog.error("STATUS REPLACE FAILED", "Could not find status indicator in the HTML");
          }
          
          // debugLog.success("UI FINALIZED", `Progressive UI finalized for ${this.actionType} action`);
        } catch (e) {
          // If finalizing fails, fall back to the standard formatting
          // debugLog.error("FINALIZE ERROR", `Error finalizing UI: ${e.message}, falling back to standard formatter`);
          
          const formattedAction = formatters.formatAction(this.actionBuffer);
          this.containerContent += formattedAction;
          
          // debugLog.warning("FALLBACK USED", "Added formatted action as fallback");
        }
      } else {
        // debugLog.ui("STANDARD FORMAT", "Using standard formatter (no progressive UI was started)");
        
        // If we haven't been showing progressive updates, use the standard formatter
        try {
          const formattedAction = formatters.formatAction(this.actionBuffer);
          this.containerContent += formattedAction;
          
          // debugLog.success("FORMATTING", "Successfully formatted and added action");
        } catch (e) {
          // If formatting fails, add the raw buffer
          // debugLog.error("FORMAT ERROR", `Error formatting action: ${e.message}, adding raw buffer`);
          
          this.containerContent += `<span class="json-action">${this.actionBuffer}</span>`;
          
          // debugLog.warning("RAW ADDED", "Added raw JSON as fallback");
        }
      }
      
      // Reset the action buffer and state
      // debugLog.info("RESETTING", "Clearing action state variables");
      
      // Log the final action data state
      // console.log(`%c FINAL ACTION DATA STATE `, 'color: white; background-color: #4169e1; padding: 2px 10px; font-weight: bold; border-radius: 3px;');
      // console.log(this.actionData);
      
      // Finalize current action component with the component system
      if (this.actionId && this.actionComponents.has(this.actionId)) {
        this.updateComponent(this.actionId, state => ({
          ...state,
          status: 'complete',
          statusText: '✓ Complete'
        }));
      }
      
      // Reset all state variables
      this.actionBuffer = '';
      this.collectingAction = false;
      this.actionId = '';
      this.actionType = '';
      this.actionPath = '';
      this.actionStarted = false;
      
      // Reset structured data
      this.actionData = {};
      
      debugLog.success("FLUSH COMPLETE", "Action buffer flushed and state reset");
      debugLog.separator();
      
      return true;
    }
    
    // Only log if we're debugging actions and there's something happening
    if (this.chunkSequence > 0 && this.collectingAction) {
      debugLog.info("NOTHING TO FLUSH", "No action buffer to flush");
    }
    return false;
  }
  
  /**
   * Flush the tool result buffer and format it based on type
   */
  private flushToolResultBuffer(): void {
    if (this.collectingToolResult && this.toolResultBuffer) {
      try {
        // Different handling based on result type
        let formattedResult = '';
        
        if (this.toolResultType === 'image' || this.toolResultTool === 'screenshot') {
          // For images, wrap in a special container for proper display
          formattedResult = `<span class="tool-result-image-wrapper">
            ${formatters.formatToolResultImage(this.toolResultBuffer)}
          </span>`;
        } else {
          // Default to text formatting for other result types
          formattedResult = formatters.formatToolResult(this.toolResultBuffer);
        }
        
        // Add the formatted result to the container
        this.containerContent += formattedResult;
      } catch (e) {
        // If formatting fails, add a fallback message
        this.containerContent += `<div class="tool-result-error">Failed to process tool result: ${e.message}</div>`;
      }
      
      // Reset the tool result buffer
      this.toolResultBuffer = '';
      this.collectingToolResult = false;
      this.toolResultType = '';
      this.toolResultTool = '';
    }
  }
  
  /**
   * Flush the file content buffer and format it based on type
   */
  private flushFileContentBuffer(): void {
    if (this.collectingFileContent && this.fileContentBuffer) {
      try {
        // Format the file content with appropriate styling
        const formattedContent = formatters.formatFileContent(
          this.fileContentBuffer,
          this.fileContentType,
          this.fileContentPath
        );
        
        // Add the formatted content to the container
        this.containerContent += `<span class="state-FILE_CONTENT">${formattedContent}</span>`;
      } catch (e) {
        // If formatting fails, add a fallback message
        this.containerContent += `<div class="tool-result-error">Failed to process file content: ${e.message}</div>`;
      }
      
      // Reset the file content buffer
      this.fileContentBuffer = '';
      this.collectingFileContent = false;
      this.fileContentPath = '';
      this.fileContentType = '';
    }
  }
  
  /**
   * Reset to initial state
   */
  reset(): void {
    // Only log reset if we had any action-related activity
    const hadActionActivity = this.collectingAction || this.actionBuffer || this.actionType;
    
    if (hadActionActivity) {
      debugLog.info("RESET", "Resetting StreamStates to initial state");
    }
    
    this.containerContent = '';
    this.actionBuffer = '';
    this.collectingAction = false;
    this.actionId = '';
    this.actionType = '';
    this.actionPath = '';
    this.actionStarted = false;
    this.currentState = 'INITIAL';
    
    // Reset tool result properties
    this.toolResultBuffer = '';
    this.collectingToolResult = false;
    this.toolResultType = '';
    this.toolResultTool = '';
    
    // Reset file content properties
    this.fileContentBuffer = '';
    this.collectingFileContent = false;
    this.fileContentPath = '';
    this.fileContentType = '';
    
    // Reset expert mode
    this.expertModeManager.cleanup();
    this.expertModeManager = new ExpertModeManager();
    this.expertModeStylesAdded = false;
    
    // Reset debug tracking
    this.currentChunk = '';
    this.nextChunkPreview = '';
    this.chunkSequence = 0;
    this.queueLength = 0;
    
    // Reset structured action data
    this.actionData = {};
    
    if (hadActionActivity) {
      debugLog.success("RESET COMPLETE", "StreamStates has been reset to initial state");
    }
  }
  
  /**
   * Sanitize HTML content to prevent unwanted resource loading
   */
  private sanitizeHtmlContent(content: string): string {
    // Remove or disable link tags that could cause resource loading
    return content
      .replace(/<link[^>]*href[^>]*>/gi, '<!-- link tag removed -->')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '<!-- script tag removed -->')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '<!-- iframe tag removed -->');
  }

  /**
   * Get the current HTML output
   */
  getHtml(): string {
    return `<div class="stream-states-container">${this.sanitizeHtmlContent(this.containerContent)}</div>`;
  }
  
  /**
   * Generate HTML - alias for getHtml for compatibility
   */
  generateHtml(): string {
    return this.getHtml();
  }
  
  /**
   * Get the current state information
   */
  getState(): any {
    return {
      currentState: this.currentState,
      html: this.getHtml(),
      segments: [],
      states: {}
    };
  }
}