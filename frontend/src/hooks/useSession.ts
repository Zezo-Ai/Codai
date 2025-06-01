'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { storage } from '@/lib/storage'
import { api, APIError } from '@/lib/api'
import { useFeatures } from './useFeatures'
import { analytics } from '@/lib/analytics'
import { recoveryAnalytics } from '@/lib/recoveryAnalytics'

import type { StoredSession } from '@/lib/storage'
import type { ChatState, Message } from '@/components/chat/types'

interface SessionState {
  sessions: StoredSession[]
  currentSessionId: string
  currentCategory: string
  isLoading: boolean
  error: string | null
}

// Global session state management
const SESSION_STORAGE_KEY = 'codai_current_session';
const SESSION_INIT_TIMEOUT = 5000;
const INIT_CHECK_INTERVAL = 100;
const CACHE_LIFETIME = 5000; // 5 seconds
const MIN_CREATION_WAIT = 100; // ms

// Global initialization and hot reload tracking
let initializedSession: { 
  id: string; 
  promise: Promise<string> | null;
  sessions: any[];
  lastRefresh: number;
  validUntil: number;
} | null = null;

// Global initialization lock
let isCreatingSession = false;
let creationPromise: Promise<any> | null = null;

// Skip repeated validations during hot reload
let lastHotReloadTime = 0;
const HOT_RELOAD_THRESHOLD = 1000; // ms

// Initialization controls
const validateSession = async (sessionId: string): Promise<boolean> => {
  try {
    const sessions = await storage.getSessions();
    return sessions.some(s => s.id === sessionId);
  } catch (error) {
    return false;
  }
};

const waitForSession = async (sessionId: string, timeout = 5000): Promise<boolean> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await validateSession(sessionId)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, INIT_CHECK_INTERVAL));
  }
  return false;
};

const createNewSession = async (): Promise<string> => {
  // Use global lock to prevent concurrent creation
  if (isCreatingSession) {
    if (creationPromise) {
      return await creationPromise;
    }
    throw new Error('Session creation locked but no promise available');
  }

  try {
    isCreatingSession = true;
    creationPromise = (async () => {
      const newSessionId = await storage.startNewSession('system');
      localStorage.setItem(SESSION_STORAGE_KEY, newSessionId);
      
      // Ensure minimum wait time for storage consistency
      await new Promise(resolve => setTimeout(resolve, MIN_CREATION_WAIT));
      
      // Wait for session to be available
      if (await waitForSession(newSessionId)) {
        return newSessionId;
      }
      throw new Error('Failed to validate new session');
    })();

    return await creationPromise;
  } finally {
    isCreatingSession = false;
    creationPromise = null;
  }
};

// Main initialization function
const ensureSingleInit = async (): Promise<string> => {
  const now = Date.now();
  const isHotReload = now - lastHotReloadTime < HOT_RELOAD_THRESHOLD;
  
  // Handle hot reload case
  if (isHotReload && initializedSession?.id) {
    return initializedSession.id;
  }
  lastHotReloadTime = now;

  // Return existing initialized session if valid and not expired
  if (initializedSession?.id && initializedSession.validUntil > now) {
    // Double check validity if it's been a while
    if (now - initializedSession.lastRefresh > CACHE_LIFETIME) {
      const isValid = await validateSession(initializedSession.id);
      if (!isValid) {
        initializedSession = null;
      } else {
        // Extend validity
        initializedSession.validUntil = now + CACHE_LIFETIME;
        return initializedSession.id;
      }
    } else {
      return initializedSession.id;
    }
  }

  // Wait for existing initialization if in progress
  if (initializedSession?.promise) {
    try {
      const sessionId = await Promise.race([
        initializedSession.promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Init timeout')), SESSION_INIT_TIMEOUT)
        )
      ]);
      return sessionId as string;
    } catch (error) {
      initializedSession = null;
    }
  }

  // Start new initialization with optimized loading
  const initPromise = (async () => {
    try {
      // Try to use cached sessions first
      const now = Date.now();
      if (initializedSession?.sessions && initializedSession.lastRefresh > now - 5000) {
        const storedId = localStorage.getItem(SESSION_STORAGE_KEY);
        if (storedId && initializedSession.sessions.some(s => s.id === storedId)) {
          return { sessions: initializedSession.sessions, id: storedId };
        }
      }

      // Get fresh sessions
      const sessions = await storage.getSessions();
      const storedId = localStorage.getItem(SESSION_STORAGE_KEY);

      // Try stored session if valid
      if (storedId && sessions.some(s => s.id === storedId)) {
        return { sessions, id: storedId };
      }

      // Use first available session
      if (sessions.length > 0) {
        const sessionId = sessions[0].id;
        localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
        return { sessions, id: sessionId };
      }

      // Create new session if none exist
      const newSessionId = await createNewSession();
      const updatedSessions = await storage.getSessions();
      return { sessions: updatedSessions, id: newSessionId };

    } catch (error) {
      initializedSession = null;
      throw error;
    }
  })();

  // Track initialization with session cache and validity
  const initTime = Date.now();
  initializedSession = {
    id: '', // Will be set after successful initialization
    promise: initPromise,
    sessions: [],
    lastRefresh: initTime,
    validUntil: initTime + CACHE_LIFETIME
  };

  // Wait for completion and update tracking with cache
  const result = await initPromise;
  const completionTime = Date.now();
  initializedSession = {
    id: result.id,
    promise: null,
    sessions: result.sessions,
    lastRefresh: completionTime,
    validUntil: completionTime + CACHE_LIFETIME
  };

  return result.id;
};

export function useSession() {
  const [state, setState] = useState<SessionState>({
    sessions: [],
    currentSessionId: '',
    currentCategory: 'system',
    isLoading: true,
    error: null
  });

  const features = useFeatures();

  const trackSessionEvent = useCallback((
    action: string, 
    metadata?: Record<string, any>
  ) => {
    if (features.analytics?.isEnabled) {
      analytics.trackEvent('session', action, {
        sessionId: state.currentSessionId,
        category: state.currentCategory,
        ...metadata
      });
    }
  }, [state.currentSessionId, state.currentCategory, features.analytics?.isEnabled]);

  const loadSessions = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Import utility functions to ensure consistent sorting
      const { 
        sortSessionsByLastUpdated, 
        validateSessionTimestamps,
        logSortEvent 
      } = await import('@/utils/sessionUtils');
      
      // Import monitoring tool for development
      const { monitorSessionSorting } = await import('@/utils/sessionSortMonitor');
      
      const now = Date.now();
      let sessions: any[] = [];
      let currentSessionId: string;

      // Get valid session ID first
      const sessionResult = await ensureSingleInit();
      currentSessionId = typeof sessionResult === 'object' ? sessionResult.id : sessionResult;
      
      if (!currentSessionId) {
        throw new Error('Failed to get valid session ID');
      }

      // Try to use cached data if valid
      if (initializedSession?.sessions?.length > 0 && 
          initializedSession.lastRefresh > now - 5000 &&
          initializedSession.sessions.some(s => s.id === currentSessionId)) {
        // Get cached sessions but ensure they're properly sorted
        sessions = sortSessionsByLastUpdated(validateSessionTimestamps(initializedSession.sessions));
        // Monitor sorting in development
        monitorSessionSorting(sessions, 'useSession-cached');
      } else {
        // Get fresh sessions (already sorted in storage.getSessions)
        sessions = await storage.getSessions();
        // Monitor sorting in development
        monitorSessionSorting(sessions, 'useSession-fresh');
      }

      // Create first session if needed
      if (sessions.length === 0) {
        const newSessionId = await storage.startNewSession('system');
        await new Promise(resolve => setTimeout(resolve, 100));
        sessions = await storage.getSessions();
        currentSessionId = newSessionId;
      }

      // Get current session
      const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
      
      if (!currentSession) {
        throw new Error('Failed to find or create valid session');
      }

      // Always ensure sessions are properly sorted before updating state or cache
      const sortedSessions = sortSessionsByLastUpdated(validateSessionTimestamps(sessions));
      
      // Log for debugging
      logSortEvent(sortedSessions, 'useSession-loadSessions');

      // Update global tracking with sorted sessions
      initializedSession = {
        id: currentSession.id,
        promise: null,
        sessions: sortedSessions, // Use sorted sessions in cache
        lastRefresh: now,
        validUntil: now + CACHE_LIFETIME
      };

      // Update local state with optimistic UI
      setState(prev => {
        const hasChanged = 
          prev.sessions !== sortedSessions ||
          prev.currentSessionId !== currentSession.id ||
          prev.currentCategory !== (currentSession.category || 'system');

        if (hasChanged) {
          return {
            ...prev,
            sessions: sortedSessions, // Use sorted sessions in state
            currentSessionId: currentSession.id,
            currentCategory: currentSession.category || 'system',
            isLoading: false,
            error: null
          };
        }
        return { ...prev, isLoading: false, error: null };
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to load sessions',
        isLoading: false
      }));
    }
  }, []);

  const initializeApp = useCallback(async () => {
    try {
      await loadSessions();
    } catch (error) {
      // Non-critical error, state will be handled by loadSessions
    }
  }, [loadSessions]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  const handleNewSession = async () => {
    try {
      // Import utility functions to ensure consistent sorting
      const { sortSessionsByLastUpdated, validateSessionTimestamps } = await import('@/utils/sessionUtils');
      const { monitorSessionSorting } = await import('@/utils/sessionSortMonitor');
      
      setState(prev => ({ ...prev, isLoading: true }));
      const sessionId = await storage.startNewSession(state.currentCategory);
      
      // Get sessions (they should already be sorted in the storage layer)
      let updatedSessions = await storage.getSessions();
      
      // Double-check sorting is correct
      updatedSessions = sortSessionsByLastUpdated(validateSessionTimestamps(updatedSessions));
      monitorSessionSorting(updatedSessions, 'handleNewSession');
      
      trackSessionEvent('create', { sessionId });

      setState(prev => ({
        ...prev,
        sessions: updatedSessions,
        currentSessionId: sessionId,
        isLoading: false
      }));
      return sessionId;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to create session',
        isLoading: false
      }));
      return null;
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      // Import utility functions to ensure consistent sorting
      const { sortSessionsByLastUpdated, validateSessionTimestamps } = await import('@/utils/sessionUtils');
      const { monitorSessionSorting } = await import('@/utils/sessionSortMonitor');
      
      setState(prev => ({ ...prev, isLoading: true }));
      await storage.deleteSession(sessionId);
      
      // Get sessions (they should already be sorted in the storage layer)
      let sessions = await storage.getSessions();
      
      // Double-check sorting is correct
      sessions = sortSessionsByLastUpdated(validateSessionTimestamps(sessions));
      monitorSessionSorting(sessions, 'handleDeleteSession');
      
      const currentId = storage.getCurrentSession();
      trackSessionEvent('delete', { sessionId });

      setState(prev => ({
        ...prev,
        sessions,
        currentSessionId: currentId || '',
        isLoading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to delete session',
        isLoading: false
      }));
    }
  };

  const handleSessionSelect = async (sessionId: string) => {
    try {
      // Import utility functions to ensure consistent sorting
      const { sortSessionsByLastUpdated, validateSessionTimestamps } = await import('@/utils/sessionUtils');
      const { monitorSessionSorting } = await import('@/utils/sessionSortMonitor');
      
      setState(prev => ({ ...prev, isLoading: true }));
      const session = await storage.switchSession(sessionId);
      
      if (session) {
        // Get sessions (they should already be sorted in the storage layer)
        let sessions = await storage.getSessions();
        
        // Double-check sorting is correct
        sessions = sortSessionsByLastUpdated(validateSessionTimestamps(sessions));
        monitorSessionSorting(sessions, 'handleSessionSelect');
        
        trackSessionEvent('select', { sessionId });

        setState(prev => ({
          ...prev,
          sessions,
          currentSessionId: sessionId,
          currentCategory: session.category || 'system',
          isLoading: false
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to switch session',
        isLoading: false
      }));
    }
  };

  const handleCategoryChange = async (category: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const sessionId = await storage.startNewSession(category);
      const sessions = await storage.getSessions();
      trackSessionEvent('change_category', { category });

      setState(prev => ({
        ...prev,
        sessions,
        currentSessionId: sessionId,
        currentCategory: category,
        isLoading: false
      }));
      return sessionId;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to change category',
        isLoading: false
      }));
      return null;
    }
  };

  const handleExportSessions = async (sessionIds?: string[]) => {
    try {
      trackSessionEvent('export', { sessionIds });
      const exportData = await storage.exportData(sessionIds);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `codai-sessions-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to export sessions'
      }));
      return false;
    }
  };

  const handleImportSessions = async (jsonData: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      trackSessionEvent('import');
      
      await storage.importData(jsonData);
      const availableSessions = await storage.getSessions();
      const currentId = storage.getCurrentSession();
      
      if (currentId) {
        const session = availableSessions.find(s => s.id === currentId);
        setState(prev => ({
          ...prev,
          sessions: availableSessions,
          currentSessionId: currentId,
          currentCategory: session?.category || 'system',
          isLoading: false
        }));
      }
      return true;
    } catch (error) {
      trackSessionEvent('import_error', { error: error instanceof Error ? error.message : String(error) });
      setState(prev => ({
        ...prev,
        error: 'Failed to import sessions',
        isLoading: false
      }));
      throw error;
    }
  };

  const updateSessionTitle = async (sessionId: string, title: string) => {
    try {
      // Update in storage first
      await storage.updateSessionTitle(sessionId, title);
      
      // Then refresh sessions
      const updatedSessions = await storage.getSessions();
      
      // Update state if needed
      setState(prev => {
        const currentSession = prev.sessions.find(s => s.id === sessionId);
        const updatedSession = updatedSessions.find(s => s.id === sessionId);
        
        // Only update if title actually changed
        if (updatedSession && currentSession?.title !== updatedSession.title) {
          return {
            ...prev,
            sessions: updatedSessions
          };
        }
        return prev;
      });
    } catch (error) {
      // Handle error silently
    }
  };

  return {
    ...state,
    features,
    handleNewSession,
    handleDeleteSession,
    handleSessionSelect,
    handleCategoryChange,
    handleExportSessions,
    handleImportSessions,
    updateSessionTitle,
    refreshSessions: loadSessions
  };
}