/**
 * Folder Operations (folder_ops) Formatter
 * Formats directory listings with a clean, structured UI
 */

interface DirectoryData {
  path: string;
  folders: string[];
  files: string[];
}

/**
 * Format folder_ops directory listing output into styled HTML
 * @param content Raw content from folder_ops tool
 * @returns Formatted HTML string with inline styles
 */
export function formatFolderOps(content: string): string {
  try {
    // Parse the directory listing
    const directoryData = parseDirectoryListing(content);
    
    // Generate HTML with inline styles
    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; border-radius: 4px; padding: 12px; margin: 10px 0; border: 1px solid #e0e0e0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
        <div style="font-size: 16px; color: #333; margin-bottom: 8px; padding-bottom: 4px;">
          <strong>📂 ${directoryData.path}</strong>
        </div>
        
        <div style="height: 1px; background-color: #e0e0e0; margin: 8px 0;"></div>
        
        ${renderFolderSection(directoryData.folders)}
        
        ${renderFileSection(directoryData.files)}
      </div>
    `;
  } catch (error) {
    console.error('Error formatting folder_ops output:', error);
    // Return original content on error, wrapped in pre tags
    return `<pre style="white-space: pre-wrap; word-break: break-all; font-family: monospace;">${content}</pre>`;
  }
}

/**
 * Parse a directory listing into structured data
 * @param content Raw directory listing from folder_ops
 * @returns Structured directory data
 */
function parseDirectoryListing(content: string): DirectoryData {
  const lines = content.split('\n');
  let path = '';
  const folders = [];
  const files = [];
  
  let inFolderSection = false;
  let inFileSection = false;
  
  // Parse each line
  for (const line of lines) {
    if (line.startsWith('Contents of directory:')) {
      path = line.replace('Contents of directory:', '').trim();
    } else if (line.includes('Folders:')) {
      inFolderSection = true;
      inFileSection = false;
    } else if (line.includes('Files:')) {
      inFolderSection = false;
      inFileSection = true;
    } else if (inFolderSection && line.trim()) {
      // Add folder (keeping the emoji)
      folders.push(line.trim());
    } else if (inFileSection && line.trim()) {
      // Add file (keeping the emoji)
      files.push(line.trim());
    }
  }
  
  return { path, folders, files };
}

/**
 * Render the folders section of the directory listing
 * @param folders Array of folder names
 * @returns HTML string for folders section
 */
function renderFolderSection(folders: string[]): string {
  if (folders.length === 0) return '';
  
  return `
    <div style="margin-bottom: 12px;">
      <div style="font-weight: bold; margin: 10px 0 5px 0; color: #555;">Folders:</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 5px;">
        ${folders.map(folder => `
          <div style="padding: 4px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-radius: 3px; transition: background-color 0.2s ease; color: #0366d6;">${folder}</div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render the files section of the directory listing
 * @param files Array of file names
 * @returns HTML string for files section
 */
function renderFileSection(files: string[]): string {
  if (files.length === 0) return '';
  
  return `
    <div style="margin-bottom: 12px;">
      <div style="font-weight: bold; margin: 10px 0 5px 0; color: #555;">Files:</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 5px;">
        ${files.map(file => `
          <div style="padding: 4px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-radius: 3px; transition: background-color 0.2s ease; color: #24292e;">${file}</div>
        `).join('')}
      </div>
    </div>
  `;
}