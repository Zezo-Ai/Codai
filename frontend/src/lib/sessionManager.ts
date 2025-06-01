'use client'

import type { Message } from '@/components/chat/types'

// Global initialization state
let globalInitPromise: Promise<void> | null = null;
let isGloballyInitializing = false;

interface SessionPersistenceState {
  lastSyncTime: number
  isInitialized: boolean
  pendingChanges: boolean
  syncErrors: string[]
  debugLogs: string[]
  pendingSessions: string[]
  currentOperation?: string
}

interface SessionMetadata {
  sessionId: string
  category: string
  lastAccessed: string
  lastModified: string
  messageCount: number
  syncStatus: 'synced' | 'pending' | 'error'
  title?: string
}

interface SyncEvent {
  type: 'sync_start' | 'sync_complete' | 'error' | 'initialization' | 'database_change' | 'debug'
  timestamp: string
  sessionId: string
  details: Record<string, any>
}

interface BackupData {
  sessionId: string
  data: {
    messages: Message[]
    metadata: SessionMetadata
  }
  timestamp: string
}

const isBrowser = typeof window !== 'undefined';

class SessionManager {
  private static instance: SessionManager
  private readonly STORAGE_PREFIX = 'codai_session_'
  private readonly DB_NAME = 'SessionStore'
  private readonly DB_VERSION = 2
  private readonly STORE_NAME = 'sessions'
  private readonly MAX_MESSAGES_PER_SESSION = 100
  private readonly CACHE_MESSAGE_COUNT = 20
  private readonly DEBUG_LOG_LIMIT = 100
  private readonly MAX_INIT_ATTEMPTS = 3

  private db: IDBDatabase | null = null
  private syncQueue: Set<string> = new Set()
  private isSyncing: boolean = false
  private isInitializing: boolean = false
  private initializationAttempts: number = 0
  private initPromise: Promise<void> | null = null
  private syncListeners: Set<(event: SyncEvent) => void> = new Set()
  private requestQueue: Array<{ resolve: (value: any) => void; reject: (error: any) => void }> = []
  private lastSessionData: any = null

  private state: SessionPersistenceState = {
    lastSyncTime: 0,
    isInitialized: false,
    pendingChanges: false,
    syncErrors: [],
    debugLogs: [],
    pendingSessions: []
  }

  private constructor() {
    if (isBrowser) {
      this.initialize();
    }
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  private async initialize(): Promise<void> {
    if (!isBrowser || this.state.isInitialized) return;

    if (this.isInitializing) {
      return this.initPromise || Promise.resolve();
    }

    this.isInitializing = true;
    this.initPromise = (async () => {
      try {

        await this.initializeDatabase();
        
        // Get initial data
        const sessions = await this.getSessionsInternal();
        this.lastSessionData = sessions;
        
        this.state.isInitialized = true;
        
        // Set initial sync time to now
        this.state.lastSyncTime = Date.now();
    
        
        // Process pending sessions
        const pending = this.getPendingSessions();
        if (pending.length > 0) {
          await this.triggerSync();
        }
      } catch (error) {

        throw error;
      } finally {
        this.isInitializing = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'sessionId' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
    });
  }

  private async getSessionsInternal(): Promise<BackupData[]> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(this.STORE_NAME, 'readonly');
    const store = tx.objectStore(this.STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result || [];
        resolve(results.map(session => ({
          sessionId: session.sessionId,
          data: {
            messages: session.data.messages || [],
            metadata: {
              ...session.data.metadata,
              messageCount: session.data.messages?.length || 0,
              title: session.data.metadata.title || 'New Chat'
            }
          },
          timestamp: session.timestamp
        })));
      };
    });
  }

  public async getAllSessions(): Promise<BackupData[]> {
    try {
      if (!this.state.isInitialized) {
        await this.initialize();
      }

      if (this.isInitializing && this.lastSessionData) {
        return this.lastSessionData;
      }

      const sessions = await this.getSessionsInternal();
      this.lastSessionData = sessions;
      
      // Update last sync time whenever we get sessions
      this.state.lastSyncTime = Date.now();
      
      return sessions;
    } catch (error) {

      return this.lastSessionData || [];
    }
  }

  public async persistSession(
    sessionId: string,
    messages: Message[],
    metadata: SessionMetadata
  ): Promise<boolean> {
    if (!isBrowser) return false;

    try {
      if (!this.state.isInitialized) {
        await this.initialize();
      }

      const sessionData = {
        messages: messages.slice(-this.MAX_MESSAGES_PER_SESSION),
        metadata: {
          ...metadata,
          messageCount: messages.length,
          lastModified: new Date().toISOString()
        }
      };

      await this.storeInIndexedDB(sessionId, sessionData);
      this.syncQueue.add(sessionId);
      await this.triggerSync();
      
      return true;
    } catch (error) {

      return false;
    }
  }

  private async storeInIndexedDB(sessionId: string, data: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);

      const item = {
        sessionId,
        data,
        timestamp: new Date().toISOString()
      };

      const request = store.put(item);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        // Update sync time when data is stored successfully
        this.state.lastSyncTime = Date.now();
        resolve();
      };
    });
  }

  private async triggerSync(): Promise<void> {
    if (this.isSyncing || this.syncQueue.size === 0) return;

    try {
      this.isSyncing = true;
      const pending = Array.from(this.syncQueue);
      
      for (const sessionId of pending) {
        try {
          const data = localStorage.getItem(this.getSessionStorageKey(sessionId));
          if (data) {
            await this.storeInIndexedDB(sessionId, JSON.parse(data));
          }
          this.syncQueue.delete(sessionId);
        } catch (error) {

        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private getPendingSessions(): string[] {
    if (!isBrowser) return [];

    return Object.keys(localStorage)
      .filter(key => key.startsWith(this.STORAGE_PREFIX))
      .map(key => key.replace(this.STORAGE_PREFIX, ''));
  }

  private getSessionStorageKey(sessionId: string): string {
    return `${this.STORAGE_PREFIX}${sessionId}`;
  }

  public async retrieveSession(sessionId: string): Promise<{
    messages: Message[]
    metadata: SessionMetadata
  } | null> {
    if (!isBrowser) return null;

    try {
      if (!this.state.isInitialized) {
        await this.initialize();
      }

      const tx = this.db!.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.get(sessionId);

      return new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            // Update last sync time when retrieving session data
            this.state.lastSyncTime = Date.now();
            resolve(result.data);
          } else {
            resolve(null);
          }
        };
      });
    } catch (error) {

      return null;
    }
  }

  public async deleteSession(sessionId: string): Promise<void> {
    if (!isBrowser) return;

    try {
      if (!this.state.isInitialized) {
        await this.initialize();
      }

      const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(sessionId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });

      localStorage.removeItem(this.getSessionStorageKey(sessionId));
    } catch (error) {

    }
  }

  public addSyncListener(listener: (event: SyncEvent) => void): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  public getSyncStatus(): SessionPersistenceState {
    return { ...this.state };
  }

  public destroy(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.syncListeners.clear();
    this.syncQueue.clear();
    this.state = {
      lastSyncTime: 0,
      isInitialized: false,
      pendingChanges: false,
      syncErrors: [],
      debugLogs: [],
      pendingSessions: []
    };
  }
}

export const sessionManager = SessionManager.getInstance();

export function useSessionManager() {
  return {
    persistSession: (sessionId: string, messages: Message[], metadata: SessionMetadata) =>
      sessionManager.persistSession(sessionId, messages, metadata),
    retrieveSession: (sessionId: string) => sessionManager.retrieveSession(sessionId),
    getSyncStatus: () => sessionManager.getSyncStatus(),
    addSyncListener: (listener: (event: SyncEvent) => void) => sessionManager.addSyncListener(listener),
    getDebugLogs: () => sessionManager.getDebugLogs ? sessionManager.getDebugLogs() : []
  };
}