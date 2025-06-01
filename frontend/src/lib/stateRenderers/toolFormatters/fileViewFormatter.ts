/**
 * File View Formatter
 * Formats file content data returned from str_replace_editor and similar tools
 */

interface FileData {
  path: string;
  content: string;
  language?: string;
  fileSize?: number;
  fileType?: string;
  lines?: Array<{
    number: number;
    content: string;
    highlighted: boolean;
  }>;
}

/**
 * Format file view content into a code display with syntax highlighting
 * @param content Raw content from file view tool result
 * @param metadata Optional metadata with file information
 * @returns Formatted HTML with code highlighting
 */
export function formatFileView(content: string, metadata?: Record<string, any>): string {
  try {
    console.log('[fileViewFormatter] Received metadata:', metadata);
    
    // Extract file data from the content or metadata
    let fileData: FileData;
    
    // If we have useful metadata, use it directly
    if (metadata && metadata.path) {
      console.log('[fileViewFormatter] Using provided metadata for file data');
      fileData = {
        path: metadata.path,
        content: content,
        language: metadata.language,
        fileSize: metadata.fileSize,
        fileType: metadata.fileType
      };
    } else {
      console.log('[fileViewFormatter] Extracting file data from content');
      fileData = extractFileData(content);
    }
    
    if (!fileData) {
      return `<div style="color: #555; font-style: italic;">No file content found</div>`;
    }

    // Determine if we should render with line numbers
    const hasLineNumbers = Array.isArray(fileData.lines) && fileData.lines.length > 0;

    // Get file size display
    const getFileSizeDisplay = (size?: number): string => {
      if (!size) return '';
      if (size < 1024) return `${size} bytes`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };
    
    // Extract meaningful filename and path information
    let displayName = 'Unknown file';
    let displayPath = '';
    
    if (fileData.path) {
      // Handle cases where path might be "File content" or other generic text
      if (fileData.path === 'File content' || fileData.path === 'Unknown file') {
        // Try to get a more meaningful name from any available information
        if (fileData.language) {
          displayName = `${fileData.language} file`;
        } else if (fileData.fileType) {
          displayName = `${fileData.fileType} file`;
        } else {
          displayName = 'Source code';
        }
      } else {
        // Extract actual filename from path
        const pathParts = fileData.path.split(/[\/\\]/);
        displayName = pathParts.pop() || 'Unknown file';
        
        // For the path, show the parent directory
        if (pathParts.length > 0) {
          // Get last 1-2 directories for context
          const parentDirs = pathParts.slice(-2);
          displayPath = parentDirs.join('/') + '/';
        }
      }
    }
    
    // Get file extension for icon
    const getFileIcon = (path?: string, language?: string): string => {
      // First, try to determine extension from path
      if (path && path !== 'File content' && path !== 'Unknown file') {
        const ext = path.split('.').pop()?.toLowerCase();
        
        // Map of extensions to icons
        const icons: Record<string, string> = {
          'ts': '📘', 'tsx': '📘', 'js': '📙', 'jsx': '📙',  // TypeScript/JavaScript
          'py': '🐍', 'rb': '💎', 'php': '🐘',               // Python/Ruby/PHP
          'java': '☕', 'cs': '🔷', 'cpp': '🔶', 'c': '🔶',   // Java/C#/C++/C
          'html': '🌐', 'css': '🎨', 'scss': '🎨',           // Web
          'md': '📝', 'txt': '📝', 'json': '📋',             // Text/Data
          'yml': '⚙️', 'yaml': '⚙️', 'xml': '⚙️', 'ini': '⚙️', // Config
          'gitignore': '🔒', 'env': '🔑',                     // Special
          'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'svg': '🖼️', // Images
        };
        
        if (ext && icons[ext]) {
          return icons[ext];
        }
      }
      
      // If extension doesn't work, try to use language
      if (language) {
        const langIcons: Record<string, string> = {
          'typescript': '📘', 'javascript': '📙',
          'python': '🐍', 'ruby': '💎', 'php': '🐘',
          'java': '☕', 'csharp': '🔷', 'cpp': '🔶', 'c': '🔶',
          'html': '🌐', 'css': '🎨', 'scss': '🎨',
          'markdown': '📝', 'text': '📝', 'json': '📋',
          'yaml': '⚙️', 'xml': '⚙️',
        };
        
        const normalizedLang = language.toLowerCase();
        if (langIcons[normalizedLang]) {
          return langIcons[normalizedLang];
        }
      }
      
      // Default icon
      return '📄';
    };

    // Get file size info
    const sizeInfo = fileData.fileSize ? getFileSizeDisplay(fileData.fileSize) : '';
    
    // Determine line count
    const lineCount = Array.isArray(fileData.lines) ? fileData.lines.length : 
                     (fileData.content.match(/\n/g)?.length || 0) + 1;
    
    // Clean up content by removing markdown code block markers
    if (fileData.content.startsWith('```') && fileData.content.endsWith('```')) {
      const lines = fileData.content.split('\n');
      if (lines.length >= 2) {
        // Remove first and last line if they're markdown markers
        if (lines[0].startsWith('```') && lines[lines.length-1] === '```') {
          lines.shift(); // Remove first line
          lines.pop();   // Remove last line
          fileData.content = lines.join('\n');
          
          // If first line contained language info but we don't have language set
          if (!fileData.language && lines[0].startsWith('```')) {
            const lang = lines[0].replace('```', '').trim();
            if (lang) fileData.language = lang;
          }
        }
      }
    }
    
    // Create an enhanced HTML structure to display the file content
    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; border-radius: 4px; overflow: hidden; margin: 10px 0; border: 1px solid #e0e0e0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="padding: 8px 16px; background-color: #f0f0f0; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">
            <span style="color: #0366d6; font-weight: 500;">${getFileIcon(fileData.path, fileData.language)} ${displayName}</span>
            ${displayPath ? `<span style="color: #666; font-size: 12px; margin-left: 8px;">${displayPath}</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #555;">
            ${lineCount ? `<span title="Line count" style="white-space: nowrap;">📝 ${lineCount} lines</span>` : ''}
            ${sizeInfo ? `<span title="File size" style="white-space: nowrap;">📊 ${sizeInfo}</span>` : ''}
            ${fileData.language ? `<span style="background: #e0e0e0; padding: 2px 6px; border-radius: 3px; font-weight: 500;">${fileData.language}</span>` : ''}
          </div>
        </div>
        
        <div style="overflow-x: auto;">
          ${hasLineNumbers ? renderWithLineNumbers(fileData) : renderSimpleCode(fileData)}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error formatting file view:', error);
    // Return original content on error with pre tags for formatting
    return `<pre style="white-space: pre-wrap; overflow-x: auto; font-family: monospace; padding: 10px; background-color: #f5f5f5; border-radius: 4px; border: 1px solid #e0e0e0;">${content}</pre>`;
  }
}

/**
 * Extract file data from the tool result content
 * @param content The raw content from the tool result
 * @returns Structured file data or null if parsing fails
 */
function extractFileData(content: string): FileData | null {
  try {
    // Check for JSON delta structure (from the stream data)
    const deltaPattern = /"type":\s*"file",\s*"metadata":/;
    if (content.match(deltaPattern)) {
      // This is likely the JSON structure from the initial example
      let jsonStr = '';
      
      // Look for the content and lines structure
      const contentMatch = content.match(/"content":\s*"(.*?)"/);
      const linesMatch = content.match(/"lines":\s*(\[.*?\])/);
      const pathMatch = content.match(/"path":\s*"([^"]*)"/);
      const languageMatch = content.match(/"language":\s*"([^"]*)"/);
      
      if (contentMatch && contentMatch[1]) {
        // Parse the escaped content
        let fileContent = contentMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        // We'll handle markdown code blocks at render time to preserve language info
        // Just store the content as-is for now
        
        // Create the file data object
        const fileData: FileData = {
          path: pathMatch && pathMatch[1] ? pathMatch[1] : 'Unknown file',
          content: fileContent
        };
        
        // Add language if available
        if (languageMatch && languageMatch[1]) {
          fileData.language = languageMatch[1];
        }
        
        // Extract file size if available
        const fileSizeMatch = content.match(/"file_size":\s*(\d+)/);
        if (fileSizeMatch && fileSizeMatch[1]) {
          fileData.fileSize = parseInt(fileSizeMatch[1], 10);
        }
        
        // Extract file type if available
        const fileTypeMatch = content.match(/"file_type":\s*"([^"]*)"/);
        if (fileTypeMatch && fileTypeMatch[1]) {
          fileData.fileType = fileTypeMatch[1];
        }
        
        // Try to parse the lines array if available
        if (linesMatch && linesMatch[1]) {
          try {
            // The lines JSON might have escaped quotes
            const linesJSON = linesMatch[1].replace(/\\"/g, '"');
            fileData.lines = JSON.parse(linesJSON);
          } catch (e) {
            console.error('Error parsing lines:', e);
          }
        }
        
        return fileData;
      }
    }
    
    // If we couldn't extract structured data, treat the entire content as raw file content
    if (content.trim().length > 0) {
      // Check if the content looks like code (has multiple lines or contains code syntax)
      const looksLikeCode = content.includes('\n') || 
                            /[{}()\[\];\.,=<>]/.test(content) ||
                            content.includes('function') ||
                            content.includes('const') ||
                            content.includes('import');
      
      if (looksLikeCode) {
        return {
          path: 'File content',
          content: content
        };
      }
    }
    
    // No file data found
    return null;
  } catch (error) {
    console.error('Error extracting file data:', error);
    return null;
  }
}

/**
 * Render file content with line numbers
 * @param fileData The structured file data
 * @returns HTML with line numbers and code content
 */
function renderWithLineNumbers(fileData: FileData): string {
  if (!fileData.lines || fileData.lines.length === 0) {
    return renderSimpleCode(fileData);
  }
  
  return `
    <table style="border-collapse: collapse; width: 100%; font-family: monospace; font-size: 14px;">
      <tbody>
        ${fileData.lines.map(line => `
          <tr${line.highlighted ? ' style="background-color: rgba(70, 149, 74, 0.1);"' : ''}>
            <td style="color: #999; text-align: right; padding: 1px 10px; user-select: none; border-right: 1px solid #e0e0e0; min-width: 40px;">
              ${line.number}
            </td>
            <td style="padding: 1px 10px; white-space: pre;">
              ${escapeHTML(line.content)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Render file content as simple code block without line numbers
 * @param fileData The structured file data
 * @returns HTML with just the code content
 */
function renderSimpleCode(fileData: FileData): string {
  return `
    <pre style="margin: 0; padding: 10px; overflow-x: auto; white-space: pre; font-family: monospace; font-size: 14px;">${escapeHTML(fileData.content)}</pre>
  `;
}

/**
 * Escape HTML special characters in a string
 * @param str String to escape
 * @returns Escaped string safe for HTML insertion
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}