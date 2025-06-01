// Global state and action tracking
export const stateTracker = {
  // Instance tracking
  instance: null as any,
  lastInit: 0,
  
  // Update tracking
  updates: new Map<string, {
    value: any,
    timestamp: number,
    version: number
  }>(),
  lastUpdate: 0,
  
  // Action tracking
  actions: new Map<string, {
    timestamp: number,
    count: number
  }>(),
  lastAction: 0,

  // State management
  version: 1,
  isDirty: false,
  lastPersist: 0,
  persistDebounce: null as NodeJS.Timeout | null,

  // Configuration
  DEBOUNCE_TIME: 2000,
  UPDATE_THRESHOLD: 1000,
  ACTION_TTL: 5000,
  
  // Methods
  track(type: string, id: string, data?: any) {
    const now = Date.now();
    const key = `${type}-${id}`;
    
    // Check recent actions
    const action = this.actions.get(key);
    if (action) {
      if (now - action.timestamp < this.UPDATE_THRESHOLD) {
        action.count++;
        return false; // Skip if too recent
      }
      action.timestamp = now;
      action.count = 1;
    } else {
      this.actions.set(key, {
        timestamp: now,
        count: 1
      });
    }

    // Track update if provided
    if (data) {
      this.updates.set(id, {
        value: data,
        timestamp: now,
        version: ++this.version
      });
      this.isDirty = true;
    }

    this.lastAction = now;
    return true; // Action tracked
  },

  shouldUpdate(type: string, id: string): boolean {
    const key = `${type}-${id}`;
    const action = this.actions.get(key);
    
    if (!action) return true;
    
    const now = Date.now();
    return now - action.timestamp >= this.UPDATE_THRESHOLD;
  },

  cleanup() {
    const now = Date.now();
    
    // Cleanup old actions
    this.actions.forEach((data, key) => {
      if (now - data.timestamp > this.ACTION_TTL) {
        this.actions.delete(key);
      }
    });

    // Cleanup old updates
    this.updates.forEach((data, id) => {
      if (now - data.timestamp > this.ACTION_TTL) {
        this.updates.delete(id);
      }
    });
  },

  getStats() {
    return {
      actions: this.actions.size,
      updates: this.updates.size,
      version: this.version,
      isDirty: this.isDirty,
      timeSinceLastAction: Date.now() - this.lastAction
    };
  }
};