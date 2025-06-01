import { ILogTransport } from '../interfaces/ILogTransport';
import { LogEntry } from '../interfaces/types';

export class FileLogTransport implements ILogTransport {
  private writeQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private retryAttempts = 3;
  private retryDelay = 1000; // 1 second

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    try {
      while (this.writeQueue.length > 0) {
        const writeOperation = this.writeQueue.shift();
        if (writeOperation) {
          await writeOperation();
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async sendLogToAPI(entry: LogEntry, attempt = 1): Promise<void> {
    try {
      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      if (attempt < this.retryAttempts) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        // Retry with exponential backoff
        await this.sendLogToAPI(entry, attempt + 1);
      } else {
        throw error;
      }
    }
  }

  async write(entry: LogEntry): Promise<void> {
    const writeOperation = async () => {
      try {
        await this.sendLogToAPI(entry);
      } catch (error) {
        console.error('Error sending log to API:', error);
        // Re-throw to be caught by error handler
        throw error;
      }
    };

    this.writeQueue.push(writeOperation);
    await this.processQueue();
  }

  async initialize(): Promise<void> {
    // No initialization needed for API transport
  }

  async dispose(): Promise<void> {
    // Process any remaining logs in queue
    await this.processQueue();
  }
}