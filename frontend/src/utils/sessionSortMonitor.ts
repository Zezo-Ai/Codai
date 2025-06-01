/**
 * Session Sort Monitor - Development utility to help track and diagnose sorting issues
 * Only active in development mode
 */

import type { StoredSession } from '@/lib/storage';
import { sortSessionsByLastUpdated } from './sessionUtils';

// Track session sorting consistency across the application
class SessionSortMonitor {
  private static instance: SessionSortMonitor;
  private isActive = process.env.NODE_ENV === 'development';
  private sessionSnapshots: Array<{
    timestamp: number;
    source: string;
    sessions: Array<{
      id: string;
      title: string;
      lastUpdated: string;
      sortKey: number;
    }>;
    isSorted: boolean;
  }> = [];
  private maxSnapshots = 20;

  private constructor() {
    if (this.isActive && typeof window !== 'undefined') {
      // Expose API for console debugging
      (window as any).__sessionSortMonitor = this;
      //console.info('Session Sort Monitor initialized in development mode. Access via window.__sessionSortMonitor');
    }
  }

  public static getInstance(): SessionSortMonitor {
    if (!SessionSortMonitor.instance) {
      SessionSortMonitor.instance = new SessionSortMonitor();
    }
    return SessionSortMonitor.instance;
  }

  /**
   * Check if sessions are correctly sorted by lastUpdated timestamp
   */
  public checkSorting(sessions: StoredSession[], source: string = 'unknown'): boolean {
    if (!this.isActive || !sessions.length) return true;

    // Map sessions to simplified objects for tracking
    const simplifiedSessions = sessions.map(session => ({
      id: session.id,
      title: session.title || 'Untitled',
      lastUpdated: session.lastUpdated,
      sortKey: new Date(session.lastUpdated).getTime()
    }));

    // Check if already sorted
    const isSorted = this.isCorrectlySorted(sessions);
    
    // Store snapshot for analysis
    this.sessionSnapshots.unshift({
      timestamp: Date.now(),
      source,
      sessions: simplifiedSessions,
      isSorted
    });

    // Trim history
    if (this.sessionSnapshots.length > this.maxSnapshots) {
      this.sessionSnapshots = this.sessionSnapshots.slice(0, this.maxSnapshots);
    }

    // Log issues in development
    if (!isSorted) {
      console.warn(
        `[SessionSortMonitor] Sorting issue detected in ${source}`,
        simplifiedSessions.map(s => `${s.title} (${new Date(s.lastUpdated).toISOString()})`)
      );
    }

    return isSorted;
  }

  /**
   * Verify if the sessions array is correctly sorted by lastUpdated
   */
  private isCorrectlySorted(sessions: StoredSession[]): boolean {
    if (sessions.length <= 1) return true;
    
    const sortedSessions = sortSessionsByLastUpdated([...sessions]);
    
    // Check if current order matches expected sort order
    return sessions.every((session, index) => 
      session.id === sortedSessions[index].id
    );
  }

  /**
   * Get recorded snapshots for debugging
   */
  public getSnapshots() {
    return [...this.sessionSnapshots];
  }

  /**
   * Clear recorded snapshots
   */
  public clearSnapshots() {
    this.sessionSnapshots = [];
    return true;
  }

  /**
   * Check the most recent sorting issue
   */
  public getLastIssue() {
    return this.sessionSnapshots.find(snapshot => !snapshot.isSorted);
  }
}

export const sessionSortMonitor = SessionSortMonitor.getInstance();

// Hook this up to monitor all session arrays
export function monitorSessionSorting(sessions: StoredSession[], source: string): StoredSession[] {
  sessionSortMonitor.checkSorting(sessions, source);
  return sessions;
}