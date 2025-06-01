import { StateManager } from './StateManager';

export type TitleOperation = 'add' | 'update' | 'verify' | 'restore' | 'snapshot' | 'persist';

interface TitleBatch {
  operations: Set<TitleOperation>;
  timestamp: number;
  version: number;
}

export class TitleState {
  private static instance: TitleState | null = null;
  private stateManager = StateManager.getInstance();
  private currentBatch: TitleBatch | null = null;
  private batchTimeout: NodeJS.Timeout | null = null;

  private static readonly BATCH_WINDOW = 100; // 100ms batch window
  private static readonly DEBUG = true;

  private constructor() {}

  static getInstance(): TitleState {
    if (!TitleState.instance) {
      TitleState.instance = new TitleState();
    }
    return TitleState.instance;
  }

  startOperation(operation: TitleOperation, id: string): { 
    shouldProcess: boolean; 
    version: number;
  } {
    // Check if operation is already in current batch
    if (this.currentBatch?.operations.has(operation)) {
      return {
        shouldProcess: false,
        version: this.currentBatch.version
      };
    }

    // Get action tracking from state manager
    const result = this.stateManager.trackAction(operation, id);
    if (!result.shouldProcess) {
      return {
        shouldProcess: false,
        version: result.version
      };
    }

    // Start new batch if needed
    const now = Date.now();
    if (!this.currentBatch || now - this.currentBatch.timestamp > TitleState.BATCH_WINDOW) {
      this.startNewBatch(result.version);
    }

    // Add operation to batch
    this.currentBatch!.operations.add(operation);

    if (TitleState.DEBUG) {
      console.log('🔄 Title operation:', {
        operation,
        id: id.slice(0, 6),
        batch: {
          age: now - this.currentBatch!.timestamp,
          ops: Array.from(this.currentBatch!.operations),
          version: this.currentBatch!.version
        }
      });
    }

    return {
      shouldProcess: true,
      version: result.version
    };
  }

  private startNewBatch(version: number) {
    // Complete previous batch if exists
    this.completeBatch();

    // Start new batch
    this.currentBatch = {
      operations: new Set(),
      timestamp: Date.now(),
      version
    };

    // Set timeout to complete batch
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    this.batchTimeout = setTimeout(() => {
      this.completeBatch();
    }, TitleState.BATCH_WINDOW);
  }

  private completeBatch() {
    if (this.currentBatch && this.currentBatch.operations.size > 0) {
      if (TitleState.DEBUG) {
        console.log('✅ Batch complete:', {
          operations: Array.from(this.currentBatch.operations),
          age: Date.now() - this.currentBatch.timestamp,
          version: this.currentBatch.version
        });
      }
    }
    this.currentBatch = null;
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }
}