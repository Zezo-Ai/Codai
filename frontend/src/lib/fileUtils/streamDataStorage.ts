/**
 * Utilities for saving and loading stream data to/from files
 */

export interface StreamDataChunk {
  timestamp: string;  // ISO string timestamp when received
  content: string;    // Raw content exactly as received
}

export interface StreamDataFile {
  id: string;         // Unique ID for the stream file
  name: string;       // User-friendly name
  description?: string; // Optional description
  createdAt: string;  // When the data was saved
  chunks: StreamDataChunk[]; // The actual stream chunks with timing
  metadata?: {        // Optional additional metadata
    totalDuration?: number;   // Total duration in ms
    format?: string;          // Format type if known
    [key: string]: any;       // Other metadata properties
  };
}

/**
 * Save stream data to a file
 */
export async function saveStreamData(
  rawChunks: string[], 
  chunksWithTimestamps: StreamDataChunk[],
  name: string, 
  description?: string
): Promise<boolean> {
  try {
    // De-duplicate chunks before saving
    const uniqueChunks: StreamDataChunk[] = [];
    const seenContent = new Set<string>();
    
    for (const chunk of chunksWithTimestamps) {
      // Normalize content to catch near-duplicates (like with/without trailing newlines)
      const normalizedContent = chunk.content
        .replace(/\n+$/, '')  // Remove trailing newlines
        .trim();              // Remove other whitespace
      
      // Skip duplicates based on normalized content
      if (!seenContent.has(normalizedContent)) {
        uniqueChunks.push(chunk);
        seenContent.add(normalizedContent);
      }
    }
    
    console.log(`Deduplicated ${chunksWithTimestamps.length} chunks to ${uniqueChunks.length} unique chunks`);
    
    // Prepare the data format
    const streamData: StreamDataFile = {
      id: generateId(),
      name: name || `Stream Data ${new Date().toLocaleString()}`,
      description,
      createdAt: new Date().toISOString(),
      chunks: uniqueChunks,
      metadata: {
        totalDuration: calculateTotalDuration(uniqueChunks),
        chunkCount: uniqueChunks.length,
        originalChunkCount: chunksWithTimestamps.length
      }
    };
    
    // Serialize to JSON
    const jsonData = JSON.stringify(streamData, null, 2);
    
    // Create a blob and download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link and click it to trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFileName(name || 'stream-data')}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    return true;
  } catch (error) {
    console.error('Failed to save stream data:', error);
    return false;
  }
}

/**
 * Load stream data from a file
 */
export async function loadStreamDataFromFile(file: File): Promise<StreamDataFile | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as StreamDataFile;
        
        // Validate the data format
        if (!data.id || !Array.isArray(data.chunks)) {
          throw new Error('Invalid stream data file format');
        }
        
        resolve(data);
      } catch (error) {
        console.error('Failed to parse stream data file:', error);
        reject(error);
      }
    };
    
    reader.onerror = (e) => {
      console.error('Error reading file:', e);
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Generate a unique ID for the stream file
 */
function generateId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calculate total duration of the stream in milliseconds
 */
function calculateTotalDuration(chunks: StreamDataChunk[]): number {
  if (chunks.length < 2) return 0;
  
  const firstTimestamp = new Date(chunks[0].timestamp).getTime();
  const lastTimestamp = new Date(chunks[chunks.length - 1].timestamp).getTime();
  
  return lastTimestamp - firstTimestamp;
}

/**
 * Sanitize a string to be used as a filename
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}