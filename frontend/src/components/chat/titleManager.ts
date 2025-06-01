/**
 * Title data structure
 */
type TitleData = {
  title: string;
  lastUpdated: number;
  lastVerified: number;
  isCustom: boolean;
};

/**
 * Snapshot data structure for backup and recovery
 */
type TitleSnapshot = {
  timestamp: number;
  titles: Record<string, string>;
};

/**
 * Action tracking info
 */
type ActionInfo = {
  time: number;
  version: number;
  type: string;
  count: number;
};

/**
 * Action tracking result
 */
type ActionResult = {
  shouldProcess: boolean;
  version: number;
};

/**
 * Cache entry type
 */
type CacheEntry = {
  title: string;
  timestamp: number;
};

/**
 * Global state - improved with better type safety and error handling
 */
const globalState = {
  instance: null as TitleManager | null,
  version: 1,
  recentActions: new Map<string, ActionInfo>(),
  lastActionTime: 0,
  titleCache: new Map<string, CacheEntry>(),
  
  // Constants
  ACTION_THROTTLE: 300,    // Reduced throttle time for more responsive UI
  ACTION_TTL: 3000,        // Increased lifetime for better action tracking
  CLEANUP_INTERVAL: 10000, // Longer interval to reduce overhead
  
  /**
   * Get next version number with proper collision handling
   */
  nextVersion(): number {
    const now = Date.now();
    // Ensure unique versions even for same timestamp
    if (now === this.lastActionTime) {
      this.version++;
    } else {
      this.version = Math.max(this.version + 1, now - this.lastActionTime);
      this.lastActionTime = now;
    }
    return this.version;
  },

  /**
   * Track an action with improved throttling and metadata
   */
  trackAction(type: string, id: string, forceProcess = false): ActionResult {
    if (!type || !id) {
      console.warn("Invalid action tracking parameters", { type, id });
      return { shouldProcess: false, version: this.version };
    }

    try {
      const now = Date.now();
      const key = `${type}:${id}`;
      const existingAction = this.recentActions.get(key);

      // Skip throttling for forced processing
      if (!forceProcess && existingAction) {
        const timeSinceAction = now - existingAction.time;
        if (timeSinceAction < this.ACTION_THROTTLE) {
          return {
            shouldProcess: false,
            version: existingAction.version
          };
        }
      }

      // Get new version and track action
      const version = this.nextVersion();
      this.recentActions.set(key, {
        time: now,
        version,
        type,
        count: (existingAction?.count || 0) + 1
      });

      return {
        shouldProcess: true,
        version
      };
    } catch (error) {
      console.error("Action tracking error:", error);
      // Fallback - allow processing
      return {
        shouldProcess: true,
        version: this.nextVersion()
      };
    }
  },

  /**
   * Clean up old actions to prevent memory leaks
   */
  cleanup() {
    try {
      const now = Date.now();
      // Use delete instead of forEach for better performance with large maps
      for (const [key, action] of this.recentActions.entries()) {
        if (now - action.time > this.ACTION_TTL) {
          this.recentActions.delete(key);
        }
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  }
};

export class TitleManager {
  private static readonly STORAGE_KEY = 'session_title_manager';
  private static readonly SNAPSHOT_INTERVAL = 60000; // 1 minute
  private static readonly MAX_SNAPSHOTS = 5;
  private static readonly RECOVERY_ENABLED = true;
  
  // Core state
  private titles: Record<string, TitleData> = {};
  private snapshots: TitleSnapshot[] = [];
  private pending?: {
    sourceId?: string;
    sourceTitle?: string;
    timestamp: number;
    intent?: string;
  };
  
  // Working state
  private persistTimeout: NodeJS.Timeout | null = null;
  private cleanupTimeout: NodeJS.Timeout | null = null;
  private cachedState: string = '';
  private verificationCache: Record<string, number> = {};
  private initialized: boolean = false;
  private storageEventBound: boolean = false;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor() {
    this.initialize();
  }

  /**
   * Get the TitleManager singleton instance
   */
  static getInstance(): TitleManager {
    if (!globalState.instance) {
      globalState.instance = new TitleManager();
    }
    return globalState.instance;
  }

  /**
   * Initialize the title manager
   */
  private initialize() {
    try {
      // Restore state from storage
      this.restoreState();
      
      // Setup cleanup interval with error handling
      const cleanupInterval = setInterval(() => {
        try {
          globalState.cleanup();
          this.performMaintenance();
        } catch (error) {
          console.error("Title manager maintenance error:", error);
        }
      }, globalState.CLEANUP_INTERVAL);
      
      // Listen for storage events from other tabs/windows
      if (!this.storageEventBound) {
        window.addEventListener('storage', this.handleStorageEvent);
        this.storageEventBound = true;
      }
      
      this.initialized = true;
    } catch (error) {
      console.error("Title manager initialization error:", error);
      // Fallback to empty state
      this.titles = {};
      this.snapshots = [];
    }
  }
  
  /**
   * Handle storage events for cross-tab synchronization
   */
  private handleStorageEvent = (event: StorageEvent) => {
    if (event.key === TitleManager.STORAGE_KEY && event.newValue !== this.cachedState) {
      this.restoreState(true); // Force restore
    }
  }
  
  /**
   * Perform periodic maintenance operations
   */
  private performMaintenance() {
    // Clean verification cache
    const now = Date.now();
    Object.keys(this.verificationCache).forEach(id => {
      if (now - this.verificationCache[id] > 60000) { // 1 minute
        delete this.verificationCache[id];
      }
    });
    
    // Clean global cache
    Array.from(globalState.titleCache.entries()).forEach(([id, entry]) => {
      if (now - entry.timestamp > 300000) { // 5 minutes
        globalState.titleCache.delete(id);
      }
    });
  }

  /**
   * Wrapper for action tracking with error handling
   */
  private processAction(type: string, id: string, force = false): ActionResult {
    if (!type || !id) {
      return { shouldProcess: true, version: globalState.version };
    }
    return globalState.trackAction(type, id, force);
  }

  /**
   * Restore state from localStorage with validation and error handling
   */
  private restoreState(force = false) {
    const { shouldProcess, version } = this.processAction('restore', 'state', force);
    if (!shouldProcess && !force) return;

    try {
      const stored = localStorage.getItem(TitleManager.STORAGE_KEY);
      if (!stored) return;
      
      // Skip if unchanged
      if (stored === this.cachedState && !force) return;
      
      // Parse and validate
      const state = JSON.parse(stored);
      
      // Validate structure
      if (!state || typeof state !== 'object') {
        console.warn("Invalid title state format in storage");
        return;
      }
      
      this.cachedState = stored;
      
      // Validate and apply titles with defaults
      if (state.titles && typeof state.titles === 'object') {
        this.titles = state.titles;
      } else {
        this.titles = {};
      }
      
      // Validate and apply snapshots with defaults
      if (Array.isArray(state.snapshots)) {
        this.snapshots = state.snapshots;
      } else {
        this.snapshots = [];
      }
    } catch (error) {
      console.error("Error restoring title state:", error);
      
      // Attempt recovery if enabled
      if (TitleManager.RECOVERY_ENABLED) {
        try {
          // Try to recover what we can
          this.attemptStateRecovery();
        } catch (recoveryError) {
          console.error("Title state recovery failed:", recoveryError);
        }
      }
    }
  }
  
  /**
   * Attempt to recover corrupted state
   */
  private attemptStateRecovery() {
    // Reset to empty state if no recovery is possible
    if (Object.keys(this.titles).length === 0) {
      this.titles = {};
    }
    
    if (this.snapshots.length === 0) {
      this.snapshots = [];
    }
    
    // Create fresh snapshot of existing titles
    this.takeSnapshot(true);
    
    // Save recovered state
    this.persistState(true);
  }

  /**
   * Persist state to localStorage with debouncing and error handling
   */
  private persistState(force = false) {
    const { shouldProcess, version } = this.processAction('persist', 'state', force);
    if (!shouldProcess && !force) return;

    try {
      // Clear existing timeout for debounce
      if (this.persistTimeout) {
        clearTimeout(this.persistTimeout);
      }

      // Prepare state
      const state = {
        titles: this.titles,
        snapshots: this.snapshots,
        lastUpdate: Date.now(),
        version: globalState.version
      };

      // Stringify state for comparison and storage
      const stateStr = JSON.stringify(state);
      
      // Skip if unchanged
      if (stateStr === this.cachedState && !force) return;

      // Debounce write operation
      this.persistTimeout = setTimeout(() => {
        try {
          localStorage.setItem(TitleManager.STORAGE_KEY, stateStr);
          this.cachedState = stateStr;
        } catch (error) {
          console.error("Error saving title state:", error);
          
          // Try alternate approaches for quota errors
          if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            this.handleStorageQuotaError(stateStr);
          }
        }
        this.persistTimeout = null;
      }, force ? 0 : 300); // Faster persistence for forced saves
    } catch (error) {
      console.error("Error preparing state persistence:", error);
    }
  }
  
  /**
   * Handle storage quota errors by pruning old data
   */
  private handleStorageQuotaError(stateStr: string) {
    try {
      // Try to free up space by removing old snapshots
      if (this.snapshots.length > 1) {
        // Keep only the most recent snapshot
        this.snapshots = this.snapshots.slice(-1);
        
        // Try again with reduced state
        const reducedState = {
          titles: this.titles,
          snapshots: this.snapshots,
          lastUpdate: Date.now(),
          version: globalState.version
        };
        
        localStorage.setItem(TitleManager.STORAGE_KEY, JSON.stringify(reducedState));
      }
    } catch (error) {
      console.error("Failed to handle storage quota error:", error);
    }
  }

  /**
   * Create a snapshot of the current titles state
   */
  private takeSnapshot(force = false): boolean {
    const { shouldProcess, version } = this.processAction('snapshot', 'system', force);
    if (!shouldProcess && !force) return false;

    try {
      const now = Date.now();
      
      // Check if too soon for new snapshot
      const lastSnapshot = this.snapshots[this.snapshots.length - 1];
      if (!force && lastSnapshot && now - lastSnapshot.timestamp < TitleManager.SNAPSHOT_INTERVAL) {
        return false;
      }

      // Extract all titles worth saving (both custom and important auto-generated)
      const titlesToSave = Object.entries(this.titles)
        .filter(([_, data]) => 
          data.isCustom || 
          (data.title && data.title !== 'New Chat' && data.lastVerified > now - 300000)
        )
        .reduce((acc, [id, data]) => {
          acc[id] = data.title;
          return acc;
        }, {} as Record<string, string>);

      // Only proceed if we have titles to save
      if (Object.keys(titlesToSave).length === 0) {
        return false;
      }

      // Skip if identical to previous snapshot
      if (!force && lastSnapshot) {
        // Compare titles efficiently
        const prevEntries = Object.entries(lastSnapshot.titles);
        const newEntries = Object.entries(titlesToSave);
        
        if (prevEntries.length === newEntries.length) {
          const areEqual = prevEntries.every(([id, title]) => 
            titlesToSave[id] === title
          );
          
          if (areEqual) {
            return false;
          }
        }
      }

      // Create and add new snapshot
      this.snapshots.push({
        timestamp: now,
        titles: titlesToSave
      });

      // Maintain max snapshots limit
      while (this.snapshots.length > TitleManager.MAX_SNAPSHOTS) {
        this.snapshots.shift();
      }
      
      // Persist the snapshot immediately
      if (force) {
        this.persistState(true);
      }

      return true;
    } catch (error) {
      console.error("Error taking snapshot:", error);
      return false;
    }
  }

  /**
   * Add or update a title for a session
   * 
   * @param sessionId The session ID
   * @param title The title to set
   * @param isCustom Whether this is a custom title (vs. auto-generated)
   * @param isNewSession Whether this is for a new session (affects behavior)
   */
  addTitle(sessionId: string, title: string, isCustom = true, isNewSession = false) {
    if (!sessionId) {
      console.warn("Cannot add title: Missing session ID");
      return;
    }
    
    try {
      // For new sessions, we should not set a title until content is added
      if (isNewSession) {
        return;
      }

      // Skip empty titles and default "New Chat" titles
      if (!title || typeof title !== 'string' || title === 'New Chat') {
        return;
      }

      // Check if we should process this action
      const { shouldProcess, version } = this.processAction('add-title', sessionId);
      if (!shouldProcess) return;

      const now = Date.now();
      
      // Create title state
      const titleState: TitleData = {
        title,
        lastUpdated: now,
        lastVerified: now,
        isCustom
      };

      // Update all caches
      this.titles[sessionId] = titleState;
      this.verificationCache[sessionId] = now;
      globalState.titleCache.set(sessionId, { title, timestamp: now });

      // Take snapshot and persist state
      this.takeSnapshot();
      this.persistState();
    } catch (error) {
      console.error(`Error adding title for session ${sessionId}:`, error);
    }
  }

  /**
   * Update a session title (alias for addTitle)
   */
  updateTitle(sessionId: string, title: string) {
    if (!sessionId || !title) return;
    this.addTitle(sessionId, title, true);
  }

  /**
   * Verify a title exists and is current
   */
  verifyTitle(sessionId: string): boolean {
    if (!sessionId) return false;
    
    try {
      const now = Date.now();
      
      // Check if we have the title in state
      const current = this.titles[sessionId];
      if (!current) return false;

      // Check global cache first for efficiency
      const cached = globalState.titleCache.get(sessionId);
      if (cached?.title === current.title && now - cached.timestamp < 30000) {
        // Still valid in cache
        return true;
      }

      // Process the verification action
      const { shouldProcess, version } = this.processAction('verify', sessionId);
      if (!shouldProcess) return true; // Skip processing but return true

      // Update verification time and cache
      this.verificationCache[sessionId] = now;
      this.titles[sessionId] = {
        ...current,
        lastVerified: now
      };

      // Update global cache
      globalState.titleCache.set(sessionId, { 
        title: current.title, 
        timestamp: now 
      });

      return true;
    } catch (error) {
      console.error(`Error verifying title for session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Restore a title for a session from various sources
   */
  restoreTitle(sessionId: string): string | undefined {
    if (!sessionId) return undefined;
    
    try {
      // Check global cache first (fastest)
      const cached = globalState.titleCache.get(sessionId);
      const now = Date.now();
      
      if (cached && now - cached.timestamp < 60000) { // 1 minute cache
        return cached.title;
      }

      // Process the action
      const { shouldProcess, version } = this.processAction('restore-title', sessionId);
      if (!shouldProcess) {
        // Return current title if we have it
        return this.titles[sessionId]?.title;
      }

      // Check the current titles
      if (this.titles[sessionId]) {
        const title = this.titles[sessionId].title;
        // Update cache
        globalState.titleCache.set(sessionId, { title, timestamp: now });
        return title;
      }

      // Check snapshots for historical titles
      for (const snapshot of this.snapshots.slice().reverse()) {
        if (snapshot.titles[sessionId]) {
          const title = snapshot.titles[sessionId];
          // Restore the title from snapshot
          this.addTitle(sessionId, title, true, false);
          return title;
        }
      }
      
      // Not found anywhere
      return undefined;
    } catch (error) {
      console.error(`Error restoring title for session ${sessionId}:`, error);
      return undefined;
    }
  }

  /**
   * Set pending session creation
   */
  setPending() {
    try {
      // Process action throttling
      const { shouldProcess, version } = this.processAction('pending', 'new-session');
      if (!shouldProcess) return;

      // Create pending state
      this.pending = {
        intent: 'new-session',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error("Error setting pending state:", error);
    }
  }

  /**
   * Clear pending session creation
   */
  clearPending() {
    if (!this.pending) return;

    try {
      const { shouldProcess, version } = this.processAction('clear-pending', 'system');
      
      if (shouldProcess) {
        this.pending = undefined;
      }
    } catch (error) {
      console.error("Error clearing pending state:", error);
      // Force clear on error
      this.pending = undefined;
    }
  }

  /**
   * Get pending session information
   */
  getPending() {
    if (!this.pending) return undefined;
    
    try {
      // Check if pending expired
      if (Date.now() - this.pending.timestamp > 5000) { // 5 seconds 
        this.pending = undefined;
        return undefined;
      }
      
      // Return only necessary information
      return {
        intent: this.pending.intent,
        timestamp: this.pending.timestamp
      };
    } catch (error) {
      console.error("Error getting pending state:", error);
      return undefined;
    }
  }

  /**
   * Get all titles
   */
  getAllTitles() {
    try {
      // Make defensive copy
      return { ...this.titles };
    } catch (error) {
      console.error("Error getting all titles:", error);
      return {};
    }
  }

  /**
   * Get snapshot of the current state
   */
  getSnapshot() {
    try {
      const { version } = this.processAction('get-snapshot', 'state');
      
      // Make defensive copies of all state
      return {
        titles: { ...this.titles },
        snapshots: [...this.snapshots],
        pending: this.pending ? { ...this.pending } : undefined,
        version
      };
    } catch (error) {
      console.error("Error getting snapshot:", error);
      return {
        titles: {},
        snapshots: [],
        version: globalState.version
      };
    }
  }

  /**
   * Clean up stale data
   */
  cleanupStale(threshold = 60000) { // 1 minute
    try {
      const { shouldProcess, version } = this.processAction('cleanup', 'stale');
      if (!shouldProcess) return;

      const now = Date.now();
      
      // Track before cleanup stats
      const before = {
        titles: Object.keys(this.titles).length,
        verificationCache: Object.keys(this.verificationCache).length,
        globalCache: globalState.titleCache.size
      };

      // Clean verification cache
      Object.keys(this.verificationCache).forEach(id => {
        if (now - this.verificationCache[id] > threshold) {
          delete this.verificationCache[id];
        }
      });
      
      // Clean global cache
      for (const [id, entry] of globalState.titleCache.entries()) {
        if (now - entry.timestamp > threshold * 2) { // Longer timeout for global cache
          globalState.titleCache.delete(id);
        }
      }
      
      // Clean titles that haven't been verified in a long time and aren't custom
      Object.keys(this.titles).forEach(id => {
        const titleData = this.titles[id];
        if (!titleData.isCustom && now - titleData.lastVerified > threshold * 5) {
          delete this.titles[id];
        }
      });
      
      // Track after cleanup stats
      const after = {
        titles: Object.keys(this.titles).length,
        verificationCache: Object.keys(this.verificationCache).length,
        globalCache: globalState.titleCache.size
      };
      
      // Check if changes warrant persistence
      if (before.titles !== after.titles) {
        this.persistState();
      }
    } catch (error) {
      console.error("Error cleaning up stale data:", error);
    }
  }
  
  /**
   * Clean up resources when no longer needed
   */
  dispose() {
    try {
      // Clear all timeouts
      if (this.persistTimeout) {
        clearTimeout(this.persistTimeout);
        this.persistTimeout = null;
      }
      
      if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = null;
      }
      
      // Remove event listeners
      if (this.storageEventBound) {
        window.removeEventListener('storage', this.handleStorageEvent);
        this.storageEventBound = false;
      }
      
      // Final state persistence
      this.persistState(true);
      
      // Clear instance
      globalState.instance = null;
    } catch (error) {
      console.error("Error disposing title manager:", error);
    }
  }
}