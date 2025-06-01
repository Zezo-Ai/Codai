/**
 * Unified logging system for stream processing
 * 
 * Provides consistent logging with multiple levels of detail
 * and can be enabled/disabled across the entire system.
 */

// Log level determines what types of logs will be shown
export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

// Log categories for organizing different parts of the system
export type LogCategory = 
  | 'stream' 
  | 'parser'
  | 'formatter'
  | 'content'
  | 'state'
  | 'tool'
  | 'message'
  | 'system';

interface LogOptions {
  level: LogLevel;
  enabled: boolean;
  showTimestamps: boolean;
  colorized: boolean;
}

/**
 * Logger for stream processing
 */
export class Logger {
  private options: LogOptions;
  private sessionId: string;

  /**
   * Create a new logger
   */
  constructor(options?: Partial<LogOptions>) {
    this.sessionId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Default options
    this.options = {
      level: 'info',
      enabled: true,
      showTimestamps: true,
      colorized: true,
      ...options
    };
  }

  /**
   * Log an error message
   */
  error(category: LogCategory, message: string, ...data: any[]): void {
    if (!this.shouldLog('error')) return;
    
    const formatted = this.format(category, 'ERROR', message);
    console.error(formatted, ...data);
  }

  /**
   * Log a warning message
   */
  warn(category: LogCategory, message: string, ...data: any[]): void {
    if (!this.shouldLog('warn')) return;
    
    const formatted = this.format(category, 'WARN', message);
    console.warn(formatted, ...data);
  }

  /**
   * Log an informational message
   */
  info(category: LogCategory, message: string, ...data: any[]): void {
    if (!this.shouldLog('info')) return;
    
    const formatted = this.format(category, 'INFO', message);
    console.log(formatted, ...data);
  }

  /**
   * Log a debug message
   */
  debug(category: LogCategory, message: string, ...data: any[]): void {
    if (!this.shouldLog('debug')) return;
    
    const formatted = this.format(category, 'DEBUG', message);
    console.log(formatted, ...data);
  }

  /**
   * Log a trace message (highest verbosity)
   */
  trace(category: LogCategory, message: string, ...data: any[]): void {
    if (!this.shouldLog('trace')) return;
    
    const formatted = this.format(category, 'TRACE', message);
    console.log(formatted, ...data);
  }

  /**
   * Log a group of related messages
   */
  group(category: LogCategory, title: string, fn: () => void): void {
    if (!this.options.enabled) return;
    
    const formatted = this.format(category, 'GROUP', title);
    console.group(formatted);
    fn();
    console.groupEnd();
  }

  /**
   * Update logger options
   */
  setOptions(options: Partial<LogOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };
  }

  /**
   * Enable or disable the logger
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  /**
   * Check if a log level should be displayed
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.options.enabled) return false;
    
    const levels: LogLevel[] = ['none', 'error', 'warn', 'info', 'debug', 'trace'];
    const currentLevelIndex = levels.indexOf(this.options.level);
    const requestedLevelIndex = levels.indexOf(level);
    
    return requestedLevelIndex <= currentLevelIndex;
  }

  /**
   * Format a log message
   */
  private format(category: LogCategory, level: string, message: string): string {
    const timestamp = this.options.showTimestamps 
      ? `[${new Date().toISOString().slice(11, 23)}] `
      : '';
    
    if (!this.options.colorized) {
      return `${timestamp}[${level}][${category}] ${message}`;
    }
    
    // Color mappings
    const colors = {
      ERROR: 'color: white; background-color: #e53935; padding: 2px 4px; border-radius: 2px;',
      WARN: 'color: #f57c00; font-weight: bold;',
      INFO: 'color: #0288d1; font-weight: bold;',
      DEBUG: 'color: #388e3c; font-weight: bold;',
      TRACE: 'color: #757575; font-weight: bold;',
      GROUP: 'color: #6200ea; font-weight: bold;',
      
      stream: 'color: #1e88e5;',
      parser: 'color: #7cb342;',
      formatter: 'color: #00897b;',
      content: 'color: #8e24aa;',
      state: 'color: #fb8c00;',
      tool: 'color: #d81b60;',
      message: 'color: #5e35b1;',
      system: 'color: #546e7a;'
    };
    
    return `${timestamp}%c[${level}]%c[${category}]%c ${message}`;
  }
}