'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, Trash2, PlusCircle } from 'lucide-react'
import type { StoredSession } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { storage } from '@/lib/storage'
import { TitleManager } from './titleManager'

interface SessionSwitcherProps {
  sessions: StoredSession[]
  currentSessionId: string
  onSessionSelect: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onNewSession: () => void
  disabled?: boolean
}

export function SessionSwitcher({
  sessions: initialSessions,
  currentSessionId,
  onSessionSelect,
  onDeleteSession,
  onNewSession,
  disabled = false
}: SessionSwitcherProps) {
  // Initialize state
  const [isOpen, setIsOpen] = useState(false)
  const [localSessions, setLocalSessions] = useState<StoredSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState(currentSessionId)

  // Use singleton title manager
  const titleManager = useRef(TitleManager.getInstance()).current;
  const syncRef = useRef({
    timeout: null as NodeJS.Timeout | null,
    pending: false,
    lastSync: 0,
    lastVersion: titleManager.getSnapshot().version || 0
  });


  // Process session updates
  const processSessionUpdates = useCallback(async (sessions: StoredSession[], trigger: string) => {
    const startTime = Date.now();
    
    // Import utility functions to ensure consistent sorting and timestamps
    const { 
      sortSessionsByLastUpdated, 
      validateSessionTimestamps,
      logSortEvent 
    } = await import('@/utils/sessionUtils');

    // First pass: Update existing titles and track changes
    const titleUpdates = new Map<string, {
      current: string;
      stored?: string;
      isNew: boolean;
    }>();

    // Validate timestamps to prevent sorting issues
    const validatedSessions = validateSessionTimestamps(sessions);

    // Track all current titles
    validatedSessions.forEach(session => {
      const storedTitle = titleManager.restoreTitle(session.id);
      let currentTitle = session.title;
      const isNewSession = !localSessions.some(ls => ls.id === session.id);
      
      // For existing sessions, prefer stored title over current
      if (!isNewSession && storedTitle && storedTitle !== 'New Chat') {
        currentTitle = storedTitle;
      }
      
      titleUpdates.set(session.id, {
        current: currentTitle || 'New Chat',
        stored: storedTitle,
        isNew: isNewSession
      });

      // Verify or update stored title
      if (!isNewSession) {
        if (currentTitle && currentTitle !== 'New Chat') {
          titleManager.updateTitle(session.id, currentTitle);
        } else if (storedTitle) {
          titleManager.verifyTitle(session.id);
        }
      }
    });

    // Handle pending title derivation
    const pending = titleManager.getPending();
    if (pending?.sourceTitle) {
      const newSession = validatedSessions.find(s => 
        s.title === 'New Chat' && 
        titleUpdates.get(s.id)?.isNew
      );

      if (newSession) {
        // Find similar existing titles
        const existingTitles = new Set(
          Array.from(titleUpdates.values())
            .map(t => t.stored || t.current)
            .filter(t => t && t !== 'New Chat')
        );

        // Generate numbered title
        const baseTitle = pending.sourceTitle.replace(/ \(\d+\)$/, '');
        let newTitle = baseTitle;
        let counter = 1;

        while (existingTitles.has(newTitle)) {
          newTitle = `${baseTitle} (${counter++})`;
        }

        // Update storage and state
        await storage.updateSessionTitle(newSession.id, newTitle);
        titleManager.addTitle(newSession.id, newTitle);
        titleUpdates.set(newSession.id, {
          current: newTitle,
          stored: newTitle,
          isNew: true
        });
        titleManager.clearPending();
      }
    }

    // Clean up and process final list
    titleManager.cleanupStale(10000); // 10 second threshold

    const processedSessions = validatedSessions.map(session => {
      const update = titleUpdates.get(session.id);
      const isNewSession = update?.isNew;
      
      // For existing sessions, preserve their title
      let finalTitle = 'New Chat';
      if (!isNewSession) {
        // Use stored title if available, otherwise fallback to current
        finalTitle = update?.stored || update?.current || 'New Chat';
      }

      return {
        ...session,
        title: finalTitle
      };
    });

    // Apply consistent sorting using the utility function
    const sortedSessions = sortSessionsByLastUpdated(processedSessions);
    
    // Debug logging in development
    logSortEvent(sortedSessions, `process-${trigger}`);

    // Check for meaningful changes
    const hasChanges = sortedSessions.length !== localSessions.length ||
      sortedSessions.some((session, idx) => {
        const local = localSessions[idx];
        return !local || 
               session.id !== local.id || 
               session.title !== local.title;
      });

    if (hasChanges) {
      setLocalSessions(sortedSessions);
    }

    return hasChanges;
  }, [localSessions]);

  // Sync function with version tracking and cleanup
  const syncSessions = useCallback(async (trigger: string) => {
    const now = Date.now();
    const timeSinceLastSync = now - syncRef.current.lastSync;
    const MIN_SYNC_INTERVAL = 1000; // 1 second minimum between syncs
    const state = titleManager.getSnapshot();

    // Skip if too recent unless critical or version changed
    if (!syncRef.current.pending && 
        trigger !== 'created' && 
        trigger !== 'deleted' &&
        state.version === syncRef.current.lastVersion &&
        timeSinceLastSync < MIN_SYNC_INTERVAL) {
      
      // Schedule future sync
      if (!syncRef.current.timeout) {
        syncRef.current.timeout = setTimeout(() => {
          syncRef.current.timeout = null;
          syncSessions('delayed-' + trigger);
        }, Math.max(MIN_SYNC_INTERVAL - timeSinceLastSync, 100));
      }
      return;
    }

    // Skip if already syncing
    if (syncRef.current.pending) return;
    syncRef.current.pending = true;

    try {
      const sessions = trigger === 'initial' ? initialSessions : await storage.getSessions();
      
      // Only cleanup on major changes or periodically
      if (trigger === 'deleted' || timeSinceLastSync > 30000) {
        titleManager.cleanupStale(30000); // Use longer threshold for cleanup
      }
      
      const updated = await processSessionUpdates(sessions, trigger);
      
      if (updated) {
        syncRef.current.lastSync = now;
        syncRef.current.lastVersion = state.version;
      }
    } catch (error) {

    } finally {
      syncRef.current.pending = false;
    }
  }, [initialSessions, processSessionUpdates]);

  // Initial sync
  useEffect(() => {
    syncSessions('initial');

    // Subscribe to storage events
    const unsubscribe = storage.onSessionChange((event) => {
      // Clear pending sync
      if (syncRef.current.timeout) {
        clearTimeout(syncRef.current.timeout);
        syncRef.current.timeout = null;
      }

      // Handle event
      switch (event.type) {
        case 'created':
        case 'deleted':
          syncSessions(event.type);
          break;

        case 'title_changed':
        case 'updated':
          setTimeout(() => syncSessions(event.type), 100);
          break;
      }
    });

    return () => {
      unsubscribe();
      if (syncRef.current.timeout) {
        clearTimeout(syncRef.current.timeout);
      }
    };
  }, [syncSessions]);

  // Track active session
  useEffect(() => {
    setActiveSessionId(currentSessionId);
  }, [currentSessionId]);

  // Event Handlers
  const handleNewSessionClick = async () => {
    setIsOpen(false);
    if (disabled) return;

    // Mark intent to create new session
    titleManager.setPending();


    onNewSession();
  };

  const handleSessionSelect = async (sessionId: string) => {
    onSessionSelect(sessionId);
    setActiveSessionId(sessionId);
    setIsOpen(false);
  };

  const handleDeleteClick = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (localSessions.length > 1) {
      onDeleteSession(sessionId);
      setLocalSessions(prev => prev.filter(s => s.id !== sessionId));
    }
  };

  // UI State
  const currentSession = localSessions.find(s => s.id === activeSessionId);
  
  // Use the imported utility for consistent sorting
  const { sortSessionsByLastUpdated } = require('@/utils/sessionUtils');
  const sortedSessions = sortSessionsByLastUpdated(localSessions);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg transition-colors",
          !disabled && "hover:bg-gray-50",
          disabled && "cursor-not-allowed opacity-75"
        )}
        disabled={disabled}
      >
        <span className="truncate">
          {currentSession?.title || 'New Session'}
        </span>
        <ChevronDown className={cn(
          "h-4 w-4 transition-transform",
          isOpen && "transform rotate-180",
          disabled && "opacity-50"
        )} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute top-full left-0 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              onClick={handleNewSessionClick}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              New Session
            </button>

            <div className="my-1 border-t border-gray-200" />

            {sortedSessions.map(session => (
              <div
                key={session.id}
                className="flex items-center group max-w-full"
              >
                <button
                  onClick={() => handleSessionSelect(session.id)}
                  className={cn(
                    "flex-1 min-w-0 px-3 py-2 text-sm text-left rounded-md transition-colors",
                    session.id === activeSessionId
                      ? "bg-indigo-50 text-indigo-600"
                      : "hover:bg-gray-50"
                  )}
                >
                  <div className="font-medium truncate max-w-full">
                    {session.title || 'Untitled Session'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(session.startTime).toLocaleDateString()} • {session.messageCount} messages
                  </div>
                </button>
                
                {localSessions.length > 1 && (
                  <button
                    onClick={(e) => handleDeleteClick(e, session.id)}
                    className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete session"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isOpen && !disabled && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}