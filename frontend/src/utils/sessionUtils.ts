/**
 * Utilities for consistent session handling and sorting
 */

import type { StoredSession } from '@/lib/storage';

/**
 * Sorts sessions by lastUpdated timestamp in descending order (newest first)
 */
export function sortSessionsByLastUpdated(sessions: StoredSession[]): StoredSession[] {
  return [...sessions].sort((a, b) => {
    const dateA = new Date(a.lastUpdated).getTime();
    const dateB = new Date(b.lastUpdated).getTime();
    return dateB - dateA;
  });
}

/**
 * Returns the current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Ensures all sessions have valid timestamps
 */
export function validateSessionTimestamps(sessions: StoredSession[]): StoredSession[] {
  const now = getCurrentTimestamp();
  
  return sessions.map(session => {
    // Validate lastUpdated
    if (!session.lastUpdated || isInvalidDate(session.lastUpdated)) {
      return { ...session, lastUpdated: now };
    }
    
    // Validate startTime if present
    if (session.startTime && isInvalidDate(session.startTime)) {
      return { ...session, startTime: now };
    }
    
    return session;
  });
}

/**
 * Debug helper to log session sorting information
 */
export function logSortEvent(sessions: StoredSession[], trigger: string): void {
  // Logging disabled to reduce console noise
}

// Helper function to check if a date string produces an invalid date
function isInvalidDate(dateString: string): boolean {
  const timestamp = new Date(dateString).getTime();
  return isNaN(timestamp);
}