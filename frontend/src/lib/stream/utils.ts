/**
 * Utility functions for the stream processing library
 */

/**
 * Generate a UUID-like unique identifier
 * This is a simple implementation that doesn't require external dependencies
 * Not cryptographically secure, but sufficient for our purposes
 */
export function generateId(): string {
  // Create a timestamp component (first part of the ID)
  const timestamp = Date.now().toString(36);
  
  // Create random components
  const randomA = Math.random().toString(36).substring(2, 8);
  const randomB = Math.random().toString(36).substring(2, 8);
  const randomC = Math.random().toString(36).substring(2, 8);
  
  // Combine parts to create a UUID-like string
  return `${timestamp}-${randomA}-${randomB}-${randomC}`;
}