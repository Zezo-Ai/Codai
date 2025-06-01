'use client'

import { useState, useEffect } from 'react'
import { storage } from '@/lib/storage'

// Global state for session creation
let isCreatingSession = false
let sessionCreationPromise: Promise<string> | null = null
let currentSessionId: string | null = null

export function useSessionCreation() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    const ensureSession = async () => {
      try {
        // If already creating, wait for it
        if (isCreatingSession && sessionCreationPromise) {

          const id = await sessionCreationPromise;
          setSessionId(id);
          return;
        }

        // Check if we have a current session
        if (currentSessionId) {

          setSessionId(currentSessionId);
          return;
        }

        // Check localStorage
        const storedId = localStorage.getItem('codai_current_session');
        if (storedId) {

          currentSessionId = storedId;
          setSessionId(storedId);
          return;
        }

        // Create new session
        isCreatingSession = true;
        sessionCreationPromise = (async () => {
          try {
            // Generate ID first
            const newId = crypto.randomUUID();
            
            // Create basic session data
            const sessionData = {
              id: newId,
              startTime: new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
              category: 'system',
              messageCount: 0,
              title: 'New Chat'
            };

            // Store session info
            localStorage.setItem('codai_current_session', newId);
            localStorage.setItem('codai_sessions', JSON.stringify([sessionData]));

            // Return the ID
            return newId;
          } finally {
            isCreatingSession = false;
          }
        })();

        const newSessionId = await sessionCreationPromise;
        currentSessionId = newSessionId;
        setSessionId(newSessionId);
        sessionCreationPromise = null;

      } catch (error) {

        setError(error instanceof Error ? error.message : 'Failed to initialize session');
      } finally {
        setIsLoading(false);
      }
    };

    ensureSession();
  }, []);

  return {
    isLoading,
    error,
    sessionId,
    isCreatingSession: isCreatingSession
  };
}