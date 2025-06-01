/**
 * Core logging levels
 */
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  TRACE = 'TRACE'
}

/**
 * Log categories for organization
 */
export enum LogCategory {
  SYSTEM = 'SYSTEM',
  SESSION = 'SESSION',
  CHAT = 'CHAT',
  STORAGE = 'STORAGE',
  NETWORK = 'NETWORK',
  UI = 'UI'
}

/**
 * Basic log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  format: {
    component: string;
    action: string;
    category: LogCategory;
    timestamp?: string;
    [key: string]: any;
  };
  error?: Error | unknown;
}

/**
 * Transport configuration options
 */
export interface TransportConfig {
  enabled: boolean;
  minLevel?: LogLevel;
  maxRetries?: number;
  batchSize?: number;
  flushInterval?: number;
  [key: string]: any;
}

/**
 * Generic metadata type for backward compatibility
 */
export interface LogMetadata {
  category?: LogCategory;
  component?: string;
  action?: string;
  timestamp?: string;
  [key: string]: any;
}