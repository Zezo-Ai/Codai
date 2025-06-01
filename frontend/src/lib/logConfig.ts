/**
 * Logging Configuration
 * 
 * Central configuration for application logging levels and behavior.
 */

// Define log levels directly to avoid circular dependency
export enum LogLevel {
  ERROR = 1,   // Critical errors
  WARN = 2,    // Potential issues
  INFO = 3,    // Key processing steps
  DEBUG = 4,    // Detailed information
  TRACE = 5    // Raw data snapshots
}

// Set this to control the verbosity of diagnostic logging
// LogLevel.ERROR - Only show errors
// LogLevel.WARN - Show errors and warnings
// LogLevel.INFO - Show errors, warnings, and key information
// LogLevel.DEBUG - Show detailed debugging information
// LogLevel.TRACE - Show everything including raw data

export const DIAGNOSTIC_LOG_LEVEL = LogLevel.ERROR;

// Set to false to completely disable diagnostic logging
export const ENABLE_DIAGNOSTIC_LOGGING = false;