import { useCallback, useEffect, useRef } from 'react';
import { TitleManager } from '@/components/chat/titleManager';
import type { StoredSession } from '@/lib/storage';


interface TitleState {
  sessionId: string;
  title: string;
  isProcessing: boolean;
  lastUpdate: number;
  version: number;
}

// Global state cache
const stateCache = {
  titles: new Map<string, TitleState>(),
  lastCleanup: 0,
  version: 0
};

export function useSessionTitles() {
  const titleManager = useRef(new TitleManager()).current;
  const processRef = useRef({
    pending: false,
    lastUpdate: 0,
    version: 0
  });

  // Cleanup old titles periodically
  useEffect(() => {
    const now = Date.now();
    if (now - stateCache.lastCleanup > 30000) { // 30 seconds
      stateCache.lastCleanup = now;
      const state = titleManager.getSnapshot();
      
      // Update version if needed
      if (state.version > stateCache.version) {
        stateCache.version = state.version;
      }
    }
  }, [titleManager]);

  const processTitles = useCallback(async (
    sessions: StoredSession[],
    trigger: string
  ) => {
    const now = Date.now();
    
    // Skip if too recent unless forced
    if (!trigger.includes('initial') && 
        now - processRef.current.lastUpdate < 1000) {
      return;
    }

    // Skip if already processing
    if (processRef.current.pending) {
      return;
    }

    try {
      processRef.current.pending = true;
      const state = titleManager.getSnapshot();
      
      // Skip if no version change
      if (state.version === processRef.current.version && 
          trigger !== 'initial') {
        return;
      }



      // Process titles efficiently
      let hasChanges = false;
      for (const session of sessions) {
        const cached = stateCache.titles.get(session.id);
        
        // Skip if cached and not forced
        if (cached && 
            cached.version === state.version && 
            trigger !== 'initial') {
          continue;
        }

        const title = titleManager.restoreTitle(session.id) || session.title;
        
        // Update cache if changed
        if (!cached || cached.title !== title) {
          stateCache.titles.set(session.id, {
            sessionId: session.id,
            title,
            isProcessing: false,
            lastUpdate: now,
            version: state.version
          });
          hasChanges = true;
        }
      }

      if (hasChanges) {
        stateCache.version = state.version;
        processRef.current.version = state.version;
      }

      processRef.current.lastUpdate = now;

    } finally {
      processRef.current.pending = false;
    }
  }, [titleManager]);

  const getTitle = useCallback((sessionId: string): string | undefined => {
    return stateCache.titles.get(sessionId)?.title;
  }, []);

  return {
    processTitles,
    getTitle,
    version: stateCache.version
  };
}