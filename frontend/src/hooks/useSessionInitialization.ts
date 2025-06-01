'use client'

import { useState, useEffect } from 'react'
import { storage } from '@/lib/storage'

// Global initialization state
let globalInitState = {
  isInitializing: false,
  initializationPromise: null as Promise<string> | null,
  initializedSessionId: null as string | null
}

export function useSessionInitialization() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    const initializeSession = async () => {
      try {
        // If already initialized, use existing session
        if (globalInitState.initializedSessionId) {
          setSessionId(globalInitState.initializedSessionId);
          setIsLoading(false);
          return;
        }

        // If initializing, wait for it
        if (globalInitState.isInitializing && globalInitState.initializationPromise) {
          const id = await globalInitState.initializationPromise;
          setSessionId(id);
          setIsLoading(false);
          return;
        }

        // Start initialization
        globalInitState.isInitializing = true;
        
        // Create initialization promise
        globalInitState.initializationPromise = (async () => {
          try {
            // Check for existing session first
            const currentSession = storage.getCurrentSession();
            if (currentSession) {
              return currentSession;
            }

            // Try to get sessions
            const sessions = await storage.getSessions();
            if (sessions.length > 0) {
              await storage.switchSession(sessions[0].id);
              return sessions[0].id;
            }

            // Create new session as last resort
            const newId = await storage.startNewSession('system');
            await storage.switchSession(newId);
            return newId;
          } catch (error) {
            throw error;
          }
        })();

        // Wait for initialization
        const id = await globalInitState.initializationPromise;
        globalInitState.initializedSessionId = id;
        setSessionId(id);

      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to initialize session');
        globalInitState.initializedSessionId = null;
      } finally {
        globalInitState.isInitializing = false;
        globalInitState.initializationPromise = null;
        setIsLoading(false);
      }
    };

    initializeSession();
  }, []);

  return { 
    isLoading, 
    error, 
    sessionId: sessionId || globalInitState.initializedSessionId 
  };
}