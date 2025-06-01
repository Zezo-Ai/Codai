/**
 * Core Imports
 */
import { Logger } from './implementations/Logger';
import { 
  LogLevel, 
  LogCategory, 
  type LogEntry, 
  type LogMetadata, 
  type TransportConfig 
} from './interfaces/types';

/**
 * Interface Exports
 */
import type { ILogger } from './interfaces/ILogger';
import type { ITransport } from './interfaces/ITransport';

/**
 * Format System
 */
import { LogFormat } from './formats';
import type { 
  BaseLogFormat,
  LogFormatModule,
  FormatMetadata,
  FormatError,
  FormatErrorCode
} from './formats/core/base';

/**
 * Transports
 */
import { FileLogTransport } from './transports/FileLogTransport';

/**
 * Format Implementations
 */
export type { SessionFormat } from './formats/implementations';

/**
 * Initialize Logger
 */
const logger = Logger.getInstance();

// Initialize logger based on environment
if (process.env.NODE_ENV === 'development') {
  logger.setMinLevel(LogLevel.DEBUG);
  
  // Silent error handling in development
} else {
  logger.setMinLevel(LogLevel.INFO);
}

// Add file transport
const fileTransport = new FileLogTransport();
logger.addTransport(fileTransport);

// Initialize logger and transports
void (async () => {
  try {
    await fileTransport.initialize();
    await logger.initialize();
  } catch (error) {
    // Handle initialization error silently
  }
})();

/**
 * Main Exports
 */
export {
  // Core
  logger,
  LogFormat,
  LogLevel,
  LogCategory,
  
  // Error Handling
  FormatError,
  
  // Types
  type LogEntry,
  type LogMetadata,
  type TransportConfig,
  type ILogger,
  type ITransport,
  type BaseLogFormat,
  type LogFormatModule,
  type FormatMetadata,
  type FormatErrorCode
};