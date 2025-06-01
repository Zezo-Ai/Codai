'use client'

import type { Message, ChatState } from '@/components/chat/types'
import { sessionManager } from './sessionManager'

const STORAGE_KEYS = {
  MESSAGES: 'codai_messages',
  SESSIONS: 'codai_sessions',
  CURRENT_SESSION: 'codai_current_session',
  THINKING_STATE: 'codai_thinking_state'
} as const

interface ExportedData {
  version: string
  timestamp: string
  sessions: StoredSession[]
  messages: Message[]
}

export interface StoredSession {
  id: string
  startTime: string
  lastUpdated: string
  category?: string
  messageCount: number
  title?: string
}

const isBrowser = typeof window !== 'undefined'

// Global session creation lock
let isCreatingSession = false
let sessionCreationPromise: Promise<string> | null = null

type SessionChangeType = 'created' | 'updated' | 'deleted' | 'title_changed';

interface SessionChangeEvent {
  type: SessionChangeType;
  sessionId: string;
  data?: any;
  timestamp: number;
}

class StorageManager {
  private static instance: StorageManager;
  private readonly VERSION = '1.0.0';
  private sessionListeners: Set<(event: SessionChangeEvent) => void> = new Set();
  private debugLogs: string[] = [];
  private readonly MAX_DEBUG_LOGS = 100;

  private addDebugLog(message: string) {
    const timestamp = new Date().toISOString();
    this.debugLogs.unshift(`${timestamp}: ${message}`);
    if (this.debugLogs.length > this.MAX_DEBUG_LOGS) {
      this.debugLogs = this.debugLogs.slice(0, this.MAX_DEBUG_LOGS);
    }
  }

  public getDebugLogs(): string[] {
    return [...this.debugLogs];
  }

  private clearDebugLogs() {
    this.debugLogs = [];
  }

  private constructor() {}

  public onSessionChange(listener: (event: SessionChangeEvent) => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  private notifyListeners(event: SessionChangeEvent): void {
    this.sessionListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Session listener error:', error);
      }
    });
  }

  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager()
    }
    return StorageManager.instance
  }

  public async startNewSession(category: string = 'system'): Promise<string> {
    this.addDebugLog(`Starting new session (category: ${category})`);
    if (!isBrowser) return crypto.randomUUID();

    // Check if session creation is in progress
    if (isCreatingSession) {
      if (sessionCreationPromise) {
        return sessionCreationPromise;
      }
    }

    // Start session creation
    isCreatingSession = true;
    sessionCreationPromise = (async () => {
      try {
        // Import utilities for consistent timestamps and sorting
        const { getCurrentTimestamp, sortSessionsByLastUpdated, logSortEvent } = await import('@/utils/sessionUtils');
        
        const sessionId = crypto.randomUUID();
        const now = getCurrentTimestamp(); // Use consistent timestamp format

        // Create session data
        const session: StoredSession = {
          id: sessionId,
          startTime: now,
          lastUpdated: now,
          category,
          messageCount: 0,
          title: 'New Chat'
        };

        // Store in IndexedDB via sessionManager
        await sessionManager.persistSession(
          sessionId,
          [],
          {
            sessionId,
            category,
            lastAccessed: now,
            lastModified: now,
            messageCount: 0,
            syncStatus: 'synced',
            title: 'New Chat'
          }
        );

        // Update localStorage
        localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, sessionId);
        this.addDebugLog(`Set current session: ${sessionId}`);

        // Update sessions list with proper sorting
        const currentSessions = await this.getSessions();
        
        // Apply consistent sorting
        const sortedSessions = sortSessionsByLastUpdated([...currentSessions, session]);
        
        // Debug logging
        logSortEvent(sortedSessions, 'new-session-creation');
        
        // Store sorted sessions
        localStorage.setItem(
          STORAGE_KEYS.SESSIONS, 
          JSON.stringify(sortedSessions)
        );
        this.addDebugLog(`Added session to session list (total: ${sortedSessions.length})`);

        // Notify listeners
        this.notifyListeners({
          type: 'created',
          sessionId,
          data: { 
            session,
            // Include sort information for transparency
            sortPosition: sortedSessions.findIndex(s => s.id === sessionId),
            totalSessions: sortedSessions.length
          },
          timestamp: Date.now()
        });
        this.addDebugLog('Session created and listeners notified');

        return sessionId;
      } finally {
        isCreatingSession = false;
        sessionCreationPromise = null;
      }
    })();

    return sessionCreationPromise;
  }

  public async getSessions(): Promise<StoredSession[]> {
    if (!isBrowser) return [];

    try {
      // Import utilities for consistent timestamp handling and sorting
      const { 
        validateSessionTimestamps, 
        sortSessionsByLastUpdated,
        logSortEvent
      } = await import('@/utils/sessionUtils');
      
      // Get sessions from sessionManager
      const sessions = await sessionManager.getAllSessions();

      // Format sessions for UI
      const formattedSessions = sessions.map(session => ({
        id: session.sessionId,
        startTime: session.data.metadata.lastAccessed || session.timestamp,
        lastUpdated: session.data.metadata.lastModified || session.timestamp,
        category: session.data.metadata.category || 'system',
        messageCount: session.data.messages?.length || 0,
        title: session.data.metadata.title || 'New Chat'
      }));

      // Validate timestamps to prevent invalid date sorting issues
      const validatedSessions = validateSessionTimestamps(formattedSessions);
      
      // Apply consistent sorting
      const sortedSessions = sortSessionsByLastUpdated(validatedSessions);
      
      // Log sorting in development
      logSortEvent(sortedSessions, 'get-sessions');

      // Update localStorage with sorted sessions
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sortedSessions));

      return sortedSessions;
    } catch (error) {
      console.error('Failed to get sessions:', error);
      
      // Try localStorage fallback
      const sessionsJson = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      if (sessionsJson) {
        try {
          const parsedSessions = JSON.parse(sessionsJson);
          
          // Even for fallback, ensure proper sorting
          const { validateSessionTimestamps, sortSessionsByLastUpdated } = await import('@/utils/sessionUtils');
          const validatedSessions = validateSessionTimestamps(parsedSessions);
          return sortSessionsByLastUpdated(validatedSessions);
        } catch (parseError) {
          console.error('Failed to parse sessions from localStorage:', parseError);
          return [];
        }
      }

      return [];
    }
  }

  public getCurrentSession(): string | null {
    if (!isBrowser) return null;
    return localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
  }

  public async switchSession(sessionId: string): Promise<StoredSession | null> {
    if (!isBrowser) return null;

    try {
      const sessions = await this.getSessions();
      const session = sessions.find(s => s.id === sessionId);

      if (session) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, sessionId);
        return session;
      }

      return null;
    } catch (error) {
      console.error('Failed to switch session:', error);
      return null;
    }
  }

  public async getSessionMessages(sessionId: string): Promise<Message[]> {
    if (!isBrowser) return [];

    try {
      const sessionData = await sessionManager.retrieveSession(sessionId);
      return sessionData?.messages || [];
    } catch (error) {
      console.error('Failed to get session messages:', error);
      return [];
    }
  }

  public async deleteSession(sessionId: string): Promise<void> {
    this.addDebugLog(`Deleting session: ${sessionId}`);
    if (!isBrowser) return;

    try {
      // Remove from sessionManager
      await sessionManager.deleteSession(sessionId);

      // Update sessions list
      const sessions = await this.getSessions();
      const updatedSessions = sessions.filter(s => s.id !== sessionId);
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(updatedSessions));

      // Notify listeners
      this.notifyListeners({
        type: 'deleted',
        sessionId,
        timestamp: Date.now()
      });

      // Clear current session if needed
      if (this.getCurrentSession() === sessionId) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }

  public async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    if (!isBrowser) return;

    try {
      // Dynamic import of utilities to ensure consistent timestamp handling
      const { getCurrentTimestamp, sortSessionsByLastUpdated } = await import('@/utils/sessionUtils');
      
      // Get current session data
      const sessionData = await sessionManager.retrieveSession(sessionId);
      if (!sessionData || sessionData.metadata.title === title) return;

      const now = getCurrentTimestamp();

      // Update in session manager
      await sessionManager.persistSession(
        sessionId,
        sessionData.messages,
        {
          ...sessionData.metadata,
          title,
          lastModified: now,
          lastTitleUpdate: now
        }
      );

      // Update local storage
      const sessions = await this.getSessions();
      const updatedSessions = sessions.map(s => 
        s.id === sessionId ? { ...s, title, lastUpdated: now } : s
      );
      
      // Always apply consistent sorting before storing
      const sortedSessions = sortSessionsByLastUpdated(updatedSessions);
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sortedSessions));

      // Notify listeners
      this.notifyListeners({
        type: 'title_changed',
        sessionId,
        data: { title, timestamp: now, sessions: sortedSessions },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to update session title:', error);
      throw error; // Re-throw to handle in caller
    }
  }
  
  // Save thinking state to local storage - by message timestamp to support multiple thinking states per chat
  public saveThinkingState(sessionId: string, messageTimestamp: number, thinkingState: {
    thinkingState: string | null;
    thinkingContent: string | null;
    thinkingSignature: string | null;
    thinkingStatus: string | null;
  }): void {
    if (!isBrowser) return;
    
    try {
      // Store thinking state by session ID and message timestamp
      const allThinkingStates = this.getAllThinkingStates();
      
      // Ensure we have an object for this session
      if (!allThinkingStates[sessionId]) {
        allThinkingStates[sessionId] = {};
      }
      
      // Update or add this message's thinking state
      allThinkingStates[sessionId][messageTimestamp.toString()] = {
        ...thinkingState,
        timestamp: Date.now()
      };
      
      // Save back to storage
      localStorage.setItem(STORAGE_KEYS.THINKING_STATE, JSON.stringify(allThinkingStates));
    } catch (error) {
      console.error('Failed to save thinking state:', error);
    }
  }
  
  // Get thinking state for a specific message in a session
  public getThinkingStateForMessage(sessionId: string, messageTimestamp: number): {
    thinkingState: string | null;
    thinkingContent: string | null;
    thinkingSignature: string | null;
    thinkingStatus: string | null;
    timestamp: number;
  } | null {
    if (!isBrowser) return null;
    
    try {
      const allThinkingStates = this.getAllThinkingStates();
      if (!allThinkingStates[sessionId]) return null;
      
      return allThinkingStates[sessionId][messageTimestamp.toString()] || null;
    } catch (error) {
      console.error('Failed to get thinking state for message:', error);
      return null;
    }
  }
  
  // Get all thinking states for a session
  public getAllThinkingStatesForSession(sessionId: string): Record<string, any> {
    if (!isBrowser) return {};
    
    try {
      const allThinkingStates = this.getAllThinkingStates();
      return allThinkingStates[sessionId] || {};
    } catch (error) {
      console.error('Failed to get thinking states for session:', error);
      return {};
    }
  }
  
  // Get all thinking states
  private getAllThinkingStates(): Record<string, Record<string, any>> {
    if (!isBrowser) return {};
    
    try {
      const storedData = localStorage.getItem(STORAGE_KEYS.THINKING_STATE);
      return storedData ? JSON.parse(storedData) : {};
    } catch (error) {
      console.error('Failed to get all thinking states:', error);
      return {};
    }
  }
  
  // Clear thinking state for a specific message in a session
  public clearThinkingStateForMessage(sessionId: string, messageTimestamp: number): void {
    if (!isBrowser) return;
    
    try {
      const allThinkingStates = this.getAllThinkingStates();
      
      // Check if we have thinking states for this session
      if (allThinkingStates[sessionId] && allThinkingStates[sessionId][messageTimestamp.toString()]) {
        // Remove the thinking state for this message
        delete allThinkingStates[sessionId][messageTimestamp.toString()];
        
        // Save back to storage
        localStorage.setItem(STORAGE_KEYS.THINKING_STATE, JSON.stringify(allThinkingStates));
      }
    } catch (error) {
      console.error('Failed to clear thinking state for message:', error);
    }
  }
  
  // Clear all thinking states for a session
  public clearAllThinkingStatesForSession(sessionId: string): void {
    if (!isBrowser) return;
    
    try {
      const allThinkingStates = this.getAllThinkingStates();
      
      // Remove this session's thinking states
      if (allThinkingStates[sessionId]) {
        delete allThinkingStates[sessionId];
        
        // Save back to storage
        localStorage.setItem(STORAGE_KEYS.THINKING_STATE, JSON.stringify(allThinkingStates));
      }
    } catch (error) {
      console.error('Failed to clear thinking states for session:', error);
    }
  }

  public async restoreState(): Promise<Partial<ChatState>> {
    if (!isBrowser) return { messages: [], metadata: { category: 'system' } };

    try {
      const currentId = this.getCurrentSession();
      if (!currentId) {
        const newSessionId = await this.startNewSession('system');
        return {
          messages: [],
          metadata: { sessionId: newSessionId, category: 'system' }
        };
      }

      const messages = await this.getSessionMessages(currentId);
      const sessions = await this.getSessions();
      const session = sessions.find(s => s.id === currentId);

      return {
        messages,
        metadata: {
          sessionId: currentId,
          category: session?.category || 'system'
        }
      };
    } catch (error) {
      console.error('Failed to restore state:', error);
      const sessionId = await this.startNewSession('system');
      return {
        messages: [],
        metadata: { sessionId, category: 'system' }
      };
    }
  }
}

export const storage = StorageManager.getInstance();