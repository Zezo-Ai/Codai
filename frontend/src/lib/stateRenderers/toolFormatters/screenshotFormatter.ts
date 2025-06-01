/**
 * Screenshot Formatter
 * Formats screenshot and image data returned from tools
 */

/**
 * Format screenshot content into an image element
 * @param content Raw content from screenshot tool result
 * @returns Formatted HTML with embedded image
 */
export function formatScreenshot(content: string): string {
  try {
    // Extract the image data
    const imageData = extractImageData(content);
    
    if (!imageData) {
      return `<div style="color: #555; font-style: italic;">No image data found</div>`;
    }

    // Create a clean HTML structure to display the image
    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <img 
          src="data:image/png;base64,${imageData}" 
          alt="Screenshot" 
          style="max-width: 100%; height: auto; border-radius: 4px;"
        />
      </div>
    `;
  } catch (error) {
    console.error('Error formatting screenshot:', error);
    // Return original content on error
    return `<div style="white-space: pre-wrap;">${content}</div>`;
  }
}

/**
 * Extract base64 image data from the tool result content
 * @param content The raw content from the tool result
 * @returns Base64 encoded image data or null if not found
 */
function extractImageData(content: string): string | null {
  try {
    // Various patterns to extract image data
    
    // Pattern 1: Look for JSON with "content" field containing base64 data
    if (content.includes('"content":')) {
      // Try to extract from JSON structure
      const jsonMatch = content.match(/"content":\s*"([^"]+)"/);
      if (jsonMatch && jsonMatch[1]) {
        return jsonMatch[1];
      }
    }
    
    // Pattern 2: Look directly for a base64 string
    const base64Match = content.match(/data:image\/[^;]+;base64,([^"\\s]+)/);
    if (base64Match && base64Match[1]) {
      return base64Match[1];
    }
    
    // Pattern 3: Entire content might be base64 data
    // Check if the content looks like base64 (alphanumeric plus +/=)
    if (/^[A-Za-z0-9+/=\s]+$/.test(content.trim())) {
      return content.trim();
    }
    
    // Pattern 4: Extract from JSON delta structure
    const deltaPattern = /"type":\s*"screenshot",\s*"content":\s*"([^"]+)"/;
    const deltaMatch = content.match(deltaPattern);
    if (deltaMatch && deltaMatch[1]) {
      return deltaMatch[1];
    }
    
    // No image data found
    return null;
  } catch (error) {
    console.error('Error extracting image data:', error);
    return null;
  }
}