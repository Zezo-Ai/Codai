import { ILogTransport } from '../interfaces/ILogTransport';
import { LogEntry } from '../interfaces/types';
import { LogFormatUtils } from '../core/LogFormat';

export class ApiLogTransport implements ILogTransport {
  private readonly apiEndpoint: string;
  private readonly batchSize: number;
  private logQueue: LogEntry[] = [];
  private isProcessing: boolean = false;
  private sessionId: string;

  constructor(apiEndpoint: string = '/api/logs', batchSize: number = 10) {
    // Ensure the API endpoint starts with /api
    this.apiEndpoint = apiEndpoint.startsWith('/api') ? apiEndpoint : `/api${apiEndpoint}`;
    this.batchSize = batchSize;
    this.sessionId = crypto.randomUUID();
  }

  public async write(entry: LogEntry): Promise<void> {
    this.logQueue.push(entry);
    
    if (this.logQueue.length >= this.batchSize) {
      await this.flushLogs();
    } else {
      // Schedule a delayed flush if not already processing
      if (!this.isProcessing) {
        setTimeout(() => this.flushLogs(), 1000);
      }
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.isProcessing || this.logQueue.length === 0) return;

    this.isProcessing = true;
    const logsToSend = this.logQueue.splice(0, this.batchSize);

    try {
      console.log('Sending logs to API:', logsToSend.length, 'entries');
      
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          logs: logsToSend.map(log => {
            // The log.message should already be formatted by JsonLogFormatter
            const logEntry = LogFormatUtils.deserialize(log.message);
            if (logEntry) {
              return logEntry;
            }

            // Fallback if parsing fails
            return LogFormatUtils.createLogEntry({
              timestamp: new Date().toISOString(),
              level: log.level,
              message: log.message,
              component: 'Unknown',
              metadata: {
                parseError: true,
                originalMessage: log.message
              }
            });
          })
        }),
        credentials: 'same-origin',
        cache: 'no-cache'
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        
        // If API call fails, store logs in localStorage as backup
        this.storeLogsLocally(logsToSend);
        throw new Error(`Failed to send logs: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error sending logs to API:', error);
      // Store failed logs locally
      this.storeLogsLocally(logsToSend);
    } finally {
      this.isProcessing = false;
    }
  }

  private storeLogsLocally(logs: LogEntry[]): void {
    try {
      const storedLogs = this.getStoredLogs();
      storedLogs.push(...logs);
      
      // Keep only last 1000 logs to prevent storage issues
      if (storedLogs.length > 1000) {
        storedLogs.splice(0, storedLogs.length - 1000);
      }
      
      localStorage.setItem('pending_logs', JSON.stringify(storedLogs));
    } catch (error) {
      console.error('Error storing logs locally:', error);
    }
  }

  private getStoredLogs(): LogEntry[] {
    try {
      const stored = localStorage.getItem('pending_logs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  public async initialize(): Promise<void> {
    // Try to send any stored logs from previous sessions
    const storedLogs = this.getStoredLogs();
    if (storedLogs.length > 0) {
      this.logQueue.push(...storedLogs);
      localStorage.removeItem('pending_logs');
      await this.flushLogs();
    }
  }

  public async dispose(): Promise<void> {
    // Flush any remaining logs before disposal
    await this.flushLogs();
  }
}