interface ActionInfo {
  time: number;
  version: number;
  type: string;
  count: number;
}

export class StateManager {
  private static instance: StateManager | null = null;
  private version = 1;
  private recentActions = new Map<string, ActionInfo>();
  private lastActionTime = 0;

  // Constants
  private static readonly ACTION_THROTTLE = 500;  // 500ms between same actions
  private static readonly CLEANUP_INTERVAL = 5000; // 5s cleanup interval
  private static readonly ACTION_TTL = 2000;      // 2s action lifetime

  private constructor() {
    // Periodic cleanup
    setInterval(() => this.cleanup(), StateManager.CLEANUP_INTERVAL);
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  private getActionKey(type: string, id: string): string {
    return `${type}:${id}`;
  }

  private shouldThrottle(action: ActionInfo, now: number): boolean {
    const timeSinceAction = now - action.time;
    
    // Always throttle frequent actions
    if (timeSinceAction < StateManager.ACTION_THROTTLE) {
      return true;
    }

    // Throttle based on frequency
    if (action.count > 3 && timeSinceAction < StateManager.ACTION_TTL) {
      return true;
    }

    return false;
  }

  private nextVersion(): number {
    const now = Date.now();
    
    // Simple increment for actions in same millisecond
    if (now === this.lastActionTime) {
      this.version++;
    } else {
      // Just increment by 1 for new timestamps
      this.version += 1;
      this.lastActionTime = now;
    }

    return this.version;
  }

  trackAction(type: string, id: string): {
    shouldProcess: boolean;
    version: number;
    actionId: string;
  } {
    const now = Date.now();
    const actionKey = this.getActionKey(type, id);
    const existingAction = this.recentActions.get(actionKey);

    // Check if action should be throttled
    if (existingAction && this.shouldThrottle(existingAction, now)) {
      return {
        shouldProcess: false,
        version: existingAction.version,
        actionId: actionKey
      };
    }

    // Get new version
    const version = this.nextVersion();

    // Update action info
    this.recentActions.set(actionKey, {
      time: now,
      version,
      type,
      count: (existingAction?.count || 0) + 1
    });

    return {
      shouldProcess: true,
      version,
      actionId: actionKey
    };
  }

  getVersion(): number {
    return this.version;
  }

  private cleanup() {
    const now = Date.now();
    const threshold = now - StateManager.ACTION_TTL;
    let cleaned = 0;
    
    // Batch delete expired actions
    const toDelete: string[] = [];
    this.recentActions.forEach((action, key) => {
      if (now - action.time > threshold) {
        toDelete.push(key);
        cleaned++;
      }
    });

    // Process deletions if needed
    if (cleaned > 0) {
      toDelete.forEach(key => this.recentActions.delete(key));
      
      // Only log significant cleanups
      if (cleaned > 2) {
        console.log('🧹 Action cleanup:', {
          cleaned,
          remaining: this.recentActions.size
        });
      }
    }
  }
}