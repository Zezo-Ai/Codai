/**
 * Types for stream processing and visualization
 */

/**
 * Represents the different states a stream can be in
 */
export type StreamState = 
  | 'INITIAL'      // Initial state
  | 'ROLE'         // Role assigned
  | 'TOKEN_UPDATE' // Token usage updated
  | 'CONTENT'      // Content streaming
  | 'TOOL_CALL'    // Tool call started
  | 'TOOL_RESULT'  // Tool result streaming
  | 'STOP'         // Stream completed
  | 'ERROR';       // Error occurred