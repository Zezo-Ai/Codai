/**
 * Stream Playback Utilities
 * 
 * Handles playback of saved stream data with original timing
 */

import { StreamDataFile, StreamDataChunk } from './streamDataStorage';

type OnChunkCallback = (chunk: string) => void;
type OnCompleteCallback = () => void;
type OnProgressCallback = (progress: number) => void; // 0-100

export interface PlaybackOptions {
  speed?: number; // Playback speed multiplier (1 = normal, 2 = 2x faster, 0.5 = half speed)
  onProgress?: OnProgressCallback;
  immediate?: boolean; // If true, ignore timing and send all chunks immediately
}

export interface StreamPlayback {
  isPlaying: boolean;
  currentChunk: number;
  totalChunks: number;
  progress: number; // 0-100
  play: () => void;
  pause: () => void;
  stop: () => void;
  setSpeed: (speed: number) => void;
  getSpeed: () => number;
}

/**
 * Create a stream playback controller
 */
export function createStreamPlayback(
  streamData: StreamDataFile,
  onChunk: OnChunkCallback,
  onComplete: OnCompleteCallback,
  options: PlaybackOptions = {}
): StreamPlayback {
  let isPlaying = false;
  let currentIndex = 0;
  let playbackSpeed = options.speed || 1;
  let timeouts: NodeJS.Timeout[] = [];
  let startTime: number | null = null;
  
  // Handle both new clean files and older files that might have duplicates
  let processedChunks = streamData.chunks;
  
  // Check if there appear to be duplicates (common pattern: identical pairs)
  const potentialDuplicates = processedChunks.length >= 2 && 
    (processedChunks.length % 2 === 0) &&
    (processedChunks.length >= 4) &&  // Only consider larger files
    (processedChunks[0].timestamp === processedChunks[1].timestamp ||
     processedChunks[0].content === processedChunks[1].content.replace(/\n\n$/, ''));
  
  if (potentialDuplicates) {
    console.log('Detected potential duplicate chunks, filtering...');
    
    // More sophisticated deduplication for old files
    const filtered: StreamDataChunk[] = [];
    const seenContent = new Set<string>();
    
    for (const chunk of processedChunks) {
      // Normalize content to handle newline differences
      const normalizedContent = chunk.content.replace(/\n+$/, '').trim();
      
      if (!seenContent.has(normalizedContent)) {
        filtered.push(chunk);
        seenContent.add(normalizedContent);
      }
    }
    
    if (filtered.length < processedChunks.length) {
      console.log(`Filtered out ${processedChunks.length - filtered.length} duplicate chunks`);
      processedChunks = filtered;
    } else {
      console.log('No duplicates found after content normalization');
    }
  } else {
    console.log('File appears to have no duplicates, using as-is');
  }
  
  const chunks = processedChunks;
  console.log(`Processing ${chunks.length} chunks for playback`);
  
  // Calculate the relative time for each chunk in milliseconds
  const times: number[] = [];
  
  if (chunks.length > 0) {
    // Calculate time deltas between chunks
    const firstTime = new Date(chunks[0].timestamp).getTime();
    
    console.log(`First chunk timestamp: ${chunks[0].timestamp}, firstTime: ${firstTime}`);
    
    for (let i = 0; i < chunks.length; i++) {
      const timestamp = new Date(chunks[i].timestamp).getTime();
      const relativeTime = timestamp - firstTime;
      times.push(relativeTime);
      
      console.log(`Chunk ${i}: timestamp=${chunks[i].timestamp}, relative=${relativeTime}ms`);
    }
    
    // Log the timing pattern to help diagnose issues
    if (times.length > 1) {
      const timingPattern = [];
      for (let i = 1; i < times.length; i++) {
        timingPattern.push(times[i] - times[i-1]);
      }
      console.log(`Timing between chunks (ms): ${timingPattern.join(', ')}`);
    }
  }
  
  // Play the stream with original timing
  const play = () => {
    console.log('Playing stream with', chunks.length, 'chunks');
    
    if (isPlaying) {
      console.log('Already playing, ignoring play call');
      return;
    }
    
    if (currentIndex >= chunks.length) {
      console.log('Resetting index from', currentIndex, 'to 0');
      currentIndex = 0; // Restart if at end
    }
    
    // CRITICAL FIX: Set playing flag and don't change it until playback actually starts
    const playbackWillStart = true; // Use a separate flag to avoid race conditions
    startTime = Date.now();
    console.log('Starting playback at index', currentIndex, 'isPlaying will be set to', playbackWillStart);
    
    // Clear any existing timeouts
    stop();
    
    // Handle immediate mode
    if (options.immediate) {
      console.log('Immediate mode: playing all chunks at once');
      chunks.forEach(chunk => {
        onChunk(chunk.content);
      });
      currentIndex = chunks.length;
      updateProgress(100);
      onComplete();
      isPlaying = false;
      return;
    }
    
    // If we have no chunks, just complete immediately
    if (chunks.length === 0) {
      console.log('No chunks to play');
      isPlaying = false;
      onComplete();
      return;
    }
    
    console.log('Scheduling', chunks.length - currentIndex, 'chunks with timing information');
    
    // Use a recursive approach to schedule chunks
    // This ensures proper sequencing and state checking
    const scheduleNextChunk = (index: number) => {
      // We'll use a local reference to the playing state to avoid race conditions
      const stillPlaying = isPlaying;
      console.log(`scheduleNextChunk called for index ${index}, isPlaying=${stillPlaying}, total chunks=${chunks.length}`);
      
      // Since we now set isPlaying immediately before scheduling, this condition should never be true
      // But we keep it as a safety check
      if (!stillPlaying) {
        console.log('WARNING: Playback was stopped before scheduling could start - this should not happen');
        return;
      }
      
      if (index >= chunks.length) {
        console.log('Reached end of chunks, playback complete');
        isPlaying = false;
        onComplete();
        return;
      }
      
      // Check if this is the first chunk or starting index
      const isFirstChunk = (index === 0 || index === currentIndex);
      
      // Calculate delay for this chunk
      let delay = 0;
      if (isFirstChunk) {
        // First chunk plays immediately
        console.log('First chunk - playing immediately');
        delay = 0;
      } else {
        const currentTime = times[index];
        const prevTime = times[index - 1];
        
        // If timestamps are the same, add a small delay
        if (currentTime === prevTime) {
          delay = 50; // Small delay between chunks with identical timestamps
          console.log(`Same timestamp as previous chunk - using artificial delay of ${delay}ms`);
        } else {
          // Use the time difference between chunks
          delay = Math.max(0, (currentTime - prevTime) / playbackSpeed);
          console.log(`Time difference: ${currentTime - prevTime}ms, adjusted for speed: ${delay}ms`);
        }
        
        // Sanity check: if delay is unreasonable, use a sensible default
        if (delay < 0) {
          console.log(`Warning: Negative delay (${delay}ms) detected, using 10ms`);
          delay = 10;
        } else if (delay > 10000) {
          console.log(`Warning: Large delay detected (${delay}ms), capping to 2000ms`);
          delay = 2000;
        } else if (delay === 0) {
          // If timestamps are close but not exactly the same
          console.log(`Zero delay detected, using minimal delay of 10ms`);
          delay = 10;
        }
      }
      
      console.log(`Scheduling chunk ${index} with delay ${delay}ms`);
      
      // Create identifier for this specific chunk timeout
      const timeout = setTimeout(() => {
        // Double-check we're still playing when the timeout fires
        if (!isPlaying) {
          console.log('Playback stopped, ignoring scheduled chunk', index);
          return;
        }
        
        console.log(`** PLAYING CHUNK ${index} ** at ${new Date().toISOString()}`);
        
        try {
          // Play this chunk and ensure we don't lose the content
          const content = chunks[index].content;
          
          // Log beginning of content for debugging
          const preview = content.length > 50 ? 
            content.substring(0, 50) + '...' : 
            content;
          console.log(`Chunk content: ${preview}`);
          
          // Send the chunk to the callback
          onChunk(content);
          
          // Update state after chunk is played
          currentIndex = index + 1;
          const progress = Math.min(100, Math.round((currentIndex / chunks.length) * 100));
          updateProgress(progress);
          
          // Schedule the next chunk with a minimal delay to avoid stack overflow
          setTimeout(() => {
            scheduleNextChunk(index + 1);
          }, 0);
        } catch (error) {
          console.error('Error playing chunk:', error);
          // Continue with next chunk despite error
          currentIndex = index + 1;
          setTimeout(() => {
            scheduleNextChunk(index + 1);
          }, 0);
        }
      }, delay);
      
      timeouts.push(timeout);
    };
    
    // CRITICAL FIX: Set playing flag right before scheduling to avoid race conditions
    console.log('Setting isPlaying to true immediately before scheduling');
    isPlaying = true;
    
    // Start scheduling from the current index
    scheduleNextChunk(currentIndex);
  };
  
  // Pause the playback
  const pause = () => {
    isPlaying = false;
    clearTimeouts();
  };
  
  // Stop and reset the playback
  const stop = () => {
    console.log('Stopping playback - current isPlaying:', isPlaying);
    
    // First clear timeouts, then update state
    clearTimeouts();
    
    // Now update state
    isPlaying = false;
    currentIndex = 0;
    updateProgress(0);
    
    console.log('Playback stopped and reset');
  };
  
  // Clear all scheduled timeouts
  const clearTimeouts = () => {
    console.log(`Clearing ${timeouts.length} scheduled timeouts`);
    timeouts.forEach(timeout => {
      try {
        clearTimeout(timeout);
      } catch (e) {
        console.error('Error clearing timeout:', e);
      }
    });
    timeouts = [];
  };
  
  // Update progress and notify
  const updateProgress = (progress: number) => {
    if (options.onProgress) {
      options.onProgress(progress);
    }
  };
  
  // Change playback speed
  const setSpeed = (speed: number) => {
    if (speed <= 0) return; // Prevent invalid speeds
    
    // If currently playing, need to restart with new speed
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      pause();
    }
    
    playbackSpeed = speed;
    
    if (wasPlaying) {
      play();
    }
  };
  
  // Get current playback speed
  const getSpeed = () => playbackSpeed;
  
  return {
    get isPlaying() { return isPlaying; },
    get currentChunk() { return currentIndex; },
    get totalChunks() { return chunks.length; },
    get progress() { return (currentIndex / chunks.length) * 100; },
    play,
    pause,
    stop,
    setSpeed,
    getSpeed
  };
}

/**
 * Create a stream from chunks
 */
export function createStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  
  return new ReadableStream({
    start(controller) {
      // Add the chunks one by one
      chunks.forEach(chunk => {
        controller.enqueue(encoder.encode(chunk));
      });
      controller.close();
    }
  });
}