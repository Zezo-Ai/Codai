import { LogLevel, LogEntry } from './types';
import { BaseLogFormat } from '../formats/core/base';
import { ITransport } from './ITransport';

/**
 * Logger interface defining core logging functionality
 */
export interface ILogger {
  /**
   * Log methods with format support
   */
  error<T extends BaseLogFormat>(message: string, error: Error | unknown, format: T): void;
  warn<T extends BaseLogFormat>(message: string, format: T): void;
  info<T extends BaseLogFormat>(message: string, format: T): void;
  debug<T extends BaseLogFormat>(message: string, format: T): void;
  trace<T extends BaseLogFormat>(message: string, format: T): void;

  /**
   * Raw log method
   */
  log(entry: LogEntry): void;

  /**
   * Configuration methods
   */
  setMinLevel(level: LogLevel): void;

  /**
   * Transport management
   */
  addTransport(transport: ITransport): void;

  /**
   * Lifecycle methods
   */
  initialize(): Promise<void>;
  dispose(): Promise<void>;

  /**
   * Error handling
   */
  setErrorHandler(handler: (error: Error, context?: Record<string, any>) => void): void;
}