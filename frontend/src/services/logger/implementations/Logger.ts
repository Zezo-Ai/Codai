import type { ILogger } from '../interfaces/ILogger';
import type { ITransport } from '../interfaces/ITransport';
import { LogLevel, type LogEntry } from '../interfaces/types';
import { BaseLogFormat } from '../formats/core/base';

/**
 * Main logger implementation
 */
export class Logger implements ILogger {
  private static instance: Logger;
  private minLevel: LogLevel = LogLevel.INFO;
  private transports: ITransport[] = [];
  private errorHandler?: (error: Error, context?: Record<string, any>) => void;
  private isInitialized: boolean = false;

  private constructor() {
    // No default console transport for silent operation
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize all transports
      await Promise.all(
        this.transports
          .filter(t => typeof t.initialize === 'function')
          .map(t => t.initialize?.())
      );
      
      this.isInitialized = true;
    } catch (error) {
      this.handleError(error as Error, { context: 'initialization' });
      throw error;
    }
  }

  public async dispose(): Promise<void> {
    try {
      // Cleanup all transports
      await Promise.all(
        this.transports
          .filter(t => typeof t.dispose === 'function')
          .map(t => t.dispose?.())
      );
      
      this.isInitialized = false;
    } catch (error) {
      this.handleError(error as Error, { context: 'disposal' });
      throw error;
    }
  }

  public addTransport(transport: ITransport): void {
    this.transports.push(transport);
  }

  public setErrorHandler(handler: (error: Error, context?: Record<string, any>) => void): void {
    this.errorHandler = handler;
  }

  private handleError(error: Error, context?: Record<string, any>): void {
    if (this.errorHandler) {
      try {
        this.errorHandler(error, context);
      } catch (handlerError) {
        // Handle silently
      }
    } else {
      // Handle silently
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    return levels.indexOf(level) <= levels.indexOf(this.minLevel);
  }

  private createEntry<T extends BaseLogFormat>(
    level: LogLevel,
    message: string,
    format: T,
    error?: Error | unknown
  ): LogEntry {
    return {
      level,
      message,
      format,
      ...(error && { error })
    };
  }

  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public async log(entry: LogEntry): Promise<void> {
    if (!this.shouldLog(entry.level)) return;

    try {
      const promises = this.transports.map(transport => 
        transport.write(entry).catch(err => {
          this.handleError(err as Error, { 
            context: 'transport_write',
            transportType: transport.constructor.name
          });
        })
      );

      await Promise.all(promises);
    } catch (error) {
      this.handleError(error as Error, { 
        context: 'log_write',
        entry: entry
      });
    }
  }

  public error<T extends BaseLogFormat>(message: string, error: Error | unknown, format: T): void {
    const entry = this.createEntry(LogLevel.ERROR, message, format, error);
    void this.log(entry);
  }

  public warn<T extends BaseLogFormat>(message: string, format: T): void {
    const entry = this.createEntry(LogLevel.WARN, message, format);
    void this.log(entry);
  }

  public info<T extends BaseLogFormat>(message: string, format: T): void {
    const entry = this.createEntry(LogLevel.INFO, message, format);
    void this.log(entry);
  }

  public debug<T extends BaseLogFormat>(message: string, format: T): void {
    const entry = this.createEntry(LogLevel.DEBUG, message, format);
    void this.log(entry);
  }

  public trace<T extends BaseLogFormat>(message: string, format: T): void {
    const entry = this.createEntry(LogLevel.TRACE, message, format);
    void this.log(entry);
  }
}