import { useState, useEffect, useCallback, useRef } from 'react';

import { useTitleManager } from './useTitleManager';
import type { StoredSession } from '@/lib/storage';

interface SessionStateData {
  sessions: StoredSession[];
  currentSessionId: string;
  isProcessing: boolean;
  error: string | null;
  lastUpdate: number;
}

// Global session state cache
const stateCache = {
  data: null as SessionStateData | null,
  version: 0,
  lastAccess: 0,
  CACHE_TTL: 1000 // 1 second cache TTL
};

export function useSessionState(
  initialSessions: StoredSession[],
  currentId: string
) {
  const titleManager = useTitleManager();
  
  // Local state
  const [state, setState] = useState<SessionStateData>(() => {
    const now = Date.now();
    
    // Try to use cached state if valid
    if (stateCache.data && 
        now - stateCache.lastAccess < stateCache.CACHE_TTL) {

      return stateCache.data;
    }

    // Initialize new state
    const newState = {
      sessions: initialSessions,
      currentSessionId: currentId,
      isProcessing: false,
      error: null,
      lastUpdate: now
    };

    // Cache new state
    stateCache.data = newState;
    stateCache.lastAccess = now;
    stateCache.version++;



    return newState;
  });

  // Update cache when state changes
  useEffect(() => {
    stateCache.data = state;
    stateCache.lastAccess = Date.now();
    stateCache.version++;
  }, [state]);

  // State update handler with optimistic updates
  const updateState = useCallback((
    updates: Partial<SessionStateData>,
    action: string
  ) => {
    setState(current => {
      const next = { ...current, ...updates };
      


      return next;
    });
  }, []);

  // Process session updates
  const processSessionUpdates = useCallback(async (
    sessions: StoredSession[],
    trigger: string
  ) => {


    updateState({ isProcessing: true }, 'process-start');

    try {
      // Update titles
      const updatedSessions = await Promise.all(
        sessions.map(async session => {
          const title = titleManager.restoreTitle(session.id) || session.title;
          return { ...session, title };
        })
      );

      updateState({ 
        sessions: updatedSessions,
        lastUpdate: Date.now(),
        isProcessing: false
      }, 'process-complete');

    } catch (error) {

      updateState({ 
        error: 'Failed to process sessions',
        isProcessing: false
      }, 'process-error');
    }
  }, [titleManager, updateState]);

  return {
    ...state,
    processSessionUpdates,
    updateState
  };
}