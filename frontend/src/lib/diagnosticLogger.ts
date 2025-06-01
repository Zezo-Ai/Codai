/**
 * Diagnostic Logger System
 * 
 * A specialized logging system designed for capturing detailed diagnostic information
 * for troubleshooting formatting and rendering issues in the application.
 */

// Import configuration from logConfig.ts
import { LogLevel, DIAGNOSTIC_LOG_LEVEL, ENABLE_DIAGNOSTIC_LOGGING } from './logConfig';

// Re-export LogLevel to maintain compatibility with existing imports
export { LogLevel };

export enum DiagnosticArea {
  FORMAT = 'format',      // Message formatting
  CONTENT = 'content',    // Content processing
  PARSER = 'parser',      // Data parsing
  RENDER = 'render',      // UI rendering
  NETWORK = 'network',    // Network operations
  SYSTEM = 'system'       // System operations
}

interface DiagnosticLog {
  timestamp: string;          // ISO timestamp
  level: LogLevel;            // Log severity level
  area: DiagnosticArea;       // Diagnostic area
  component: string;          // Component name
  action: string;             // What's happening
  message: string;            // Human-readable description
  rawData?: any;              // Raw data (input)
  processedData?: any;        // Processed data (output)
  snapshot?: string;          // Snapshot identifier
  correlationId?: string;     // To link related logs
  diagnosticCode?: string;    // Diagnostic code (e.g., "SEARCH-PARSE-ERR-01")
}

// Memory storage for logs
let diagnosticLogs: DiagnosticLog[] = [];
const MAX_LOGS = 1000;

// Set log level from configuration or default to ERROR
let currentLogLevel = DIAGNOSTIC_LOG_LEVEL || 
  (process.env.NODE_ENV === 'production' ? LogLevel.ERROR : LogLevel.INFO);

// Control whether to capture diagnostics at all
const ALWAYS_CAPTURE = ENABLE_DIAGNOSTIC_LOGGING;

// Create unique correlation IDs
let correlationCounter = 0;
function generateCorrelationId(): string {
  return `diag-${Date.now()}-${correlationCounter++}`;
}

// Current correlation ID
let currentCorrelationId = '';

/**
 * Diagnostic logger for tracing formatting and rendering processes
 */
export const diagnosticLogger = {
  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    currentLogLevel = level;
  },
  
  /**
   * Begin a diagnostic session with a correlation ID
   */
  beginDiagnosticSession(initialContext: Record<string, any> = {}): string {
    const sessionId = generateCorrelationId();
    currentCorrelationId = sessionId;
    
    this.logWithLevel(LogLevel.INFO, DiagnosticArea.SYSTEM, 'DiagnosticLogger', 'Session started', 
      'New diagnostic session started', initialContext);
    
    return sessionId;
  },
  
  /**
   * End the current diagnostic session
   */
  endDiagnosticSession(): void {
    if (currentCorrelationId) {
      this.logWithLevel(LogLevel.INFO, DiagnosticArea.SYSTEM, 'DiagnosticLogger', 'Session ended',
        'Diagnostic session completed', { sessionId: currentCorrelationId });
      currentCorrelationId = '';
    }
  },
  
  /**
   * Create a content snapshot for diagnostics
   */
  captureSnapshot(
    area: DiagnosticArea, 
    component: string, 
    data: any, 
    description: string = 'Content snapshot'
  ): string {
    const snapshotId = `snap-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    this.logWithLevel(
      LogLevel.TRACE, 
      area,
      component,
      'Capture snapshot',
      description,
      undefined,
      data,
      undefined,
      snapshotId
    );
    
    return snapshotId;
  },
  
  /**
   * Compare data against a previous snapshot
   */
  compareWithSnapshot(
    area: DiagnosticArea,
    component: string,
    snapshotId: string,
    currentData: any,
    description: string = 'Comparing with snapshot'
  ): void {
    // Find the snapshot in logs
    const snapshot = diagnosticLogs.find(
      log => log.snapshot === snapshotId && log.level === LogLevel.TRACE
    );
    
    if (!snapshot) {
      this.warn(area, component, 'Missing snapshot', 
        `Snapshot ${snapshotId} not found for comparison`);
      return;
    }
    
    this.logWithLevel(
      LogLevel.DEBUG,
      area,
      component,
      'Snapshot comparison',
      description,
      snapshot.rawData,
      currentData
    );
  },
  
  /**
   * Log method with all parameters
   */
  private logWithLevel(
    level: LogLevel,
    area: DiagnosticArea,
    component: string,
    action: string,
    message: string,
    rawData?: any,
    processedData?: any,
    diagnosticCode?: string,
    snapshot?: string
  ): void {
    // Exit early if diagnostic logging is disabled and we're not tracking errors
    if (!ENABLE_DIAGNOSTIC_LOGGING && level !== LogLevel.ERROR) {
      return;
    }
    
    // Create log entry
    const log: DiagnosticLog = {
      timestamp: new Date().toISOString(),
      level,
      area,
      component,
      action,
      message,
      correlationId: currentCorrelationId || undefined
    };
    
    // Add optional fields if provided
    if (rawData !== undefined) {
      log.rawData = this.sanitizeData(rawData);
    }
    
    if (processedData !== undefined) {
      log.processedData = this.sanitizeData(processedData);
    }
    
    if (diagnosticCode) {
      log.diagnosticCode = diagnosticCode;
    }
    
    if (snapshot) {
      log.snapshot = snapshot;
    }
    
    // Add to diagnostic logs if within limit and if logging is enabled
    if (ENABLE_DIAGNOSTIC_LOGGING && diagnosticLogs.length >= MAX_LOGS) {
      diagnosticLogs.shift();
    }
    
    // Store logs for diagnostic purposes if enabled or if it's an error
    if ((ENABLE_DIAGNOSTIC_LOGGING && (ALWAYS_CAPTURE || level <= currentLogLevel)) || level === LogLevel.ERROR) {
      diagnosticLogs.push(log);
    }
    
    // Only output to console if logging is enabled and level is appropriate
    if (level <= currentLogLevel && (ENABLE_DIAGNOSTIC_LOGGING || level === LogLevel.ERROR)) {
      this.outputToConsole(log);
    }
  },
  
  /**
   * Format data for logging, handling circular references
   */
  private sanitizeData(data: any): any {
    if (!data) return data;
    
    try {
      // For DOM nodes or elements, just return description
      if (typeof window !== 'undefined' && data instanceof Node) {
        return `[DOM Node: ${data.nodeName}]`;
      }
      
      // For Error objects, extract useful properties
      if (data instanceof Error) {
        return {
          name: data.name,
          message: data.message,
          stack: data.stack
        };
      }
      
      // Try to create clean copy via JSON (removes functions and circular refs)
      return JSON.parse(JSON.stringify(data));
    } catch (e) {
      // If JSON serialization fails, return a simplified representation
      if (typeof data === 'object') {
        const simplified: any = {};
        for (const key in data) {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            try {
              const value = data[key];
              simplified[key] = typeof value === 'object' ? '[Object]' : value;
            } catch (err) {
              simplified[key] = '[Unprocessable value]';
            }
          }
        }
        return simplified;
      }
      return '[Unserializable data]';
    }
  },
  
  /**
   * Format and output log to console
   */
  private outputToConsole(log: DiagnosticLog): void {
    // Exit early if diagnostic logging is disabled
    if (!ENABLE_DIAGNOSTIC_LOGGING) {
      return;
    }
    
    // Format log for console
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const areaTag = `[${log.area}:${log.component}]`;
    const actionTag = log.action.toUpperCase();
    const idTag = log.correlationId ? `[${log.correlationId.slice(-6)}]` : '';
    const formattedMessage = `${timestamp} ${idTag} ${areaTag} ${actionTag}: ${log.message}`;
    
    // Use appropriate console method based on level
    switch (log.level) {
      case LogLevel.ERROR:
        console.error(formattedMessage, log.rawData || '', log.processedData || '');
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, log.rawData || '', log.processedData || '');
        break;
      default:
        console.log(formattedMessage, log.rawData || '', log.processedData || '');
    }
  },
  
  /**
   * Get all logs for a specific correlation ID
   */
  getSessionLogs(correlationId?: string): DiagnosticLog[] {
    return correlationId
      ? diagnosticLogs.filter(log => log.correlationId === correlationId)
      : [...diagnosticLogs];
  },
  
  /**
   * Export logs as JSON string
   */
  exportLogs(correlationId?: string): string {
    const logs = this.getSessionLogs(correlationId);
    return JSON.stringify(logs, null, 2);
  },
  
  /**
   * Create a diagnostic report with metadata
   */
  createDiagnosticReport(correlationId?: string): string {
    const logs = this.getSessionLogs(correlationId);
    
    // Get browser and environment info
    const environmentInfo = {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      timestamp: new Date().toISOString(),
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 'unknown',
      viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown'
    };
    
    // Count logs by level
    const logCounts = {
      error: logs.filter(log => log.level === LogLevel.ERROR).length,
      warn: logs.filter(log => log.level === LogLevel.WARN).length,
      info: logs.filter(log => log.level === LogLevel.INFO).length,
      debug: logs.filter(log => log.level === LogLevel.DEBUG).length,
      trace: logs.filter(log => log.level === LogLevel.TRACE).length,
      total: logs.length
    };
    
    // Extract error details for quick reference
    const errors = logs
      .filter(log => log.level === LogLevel.ERROR)
      .map(log => ({
        area: log.area,
        component: log.component,
        action: log.action,
        message: log.message,
        diagnosticCode: log.diagnosticCode,
        timestamp: log.timestamp
      }));
    
    // Assemble the report
    const report = {
      diagnosticReport: true,
      reportVersion: "1.0",
      environment: environmentInfo,
      summary: {
        correlationId: correlationId || 'all',
        timestamp: new Date().toISOString(),
        logCounts,
        errorCount: errors.length,
      },
      errors,
      logs
    };
    
    return JSON.stringify(report, null, 2);
  },
  
  /**
   * Clear all logs
   */
  clearLogs(): void {
    diagnosticLogs = [];
  },
  
  /**
   * Convenience log methods for different levels
   */
  error(area: DiagnosticArea, component: string, action: string, message: string, 
        rawData?: any, diagnosticCode?: string): void {
    this.logWithLevel(LogLevel.ERROR, area, component, action, message, rawData, undefined, diagnosticCode);
  },
  
  warn(area: DiagnosticArea, component: string, action: string, message: string, 
       rawData?: any, diagnosticCode?: string): void {
    this.logWithLevel(LogLevel.WARN, area, component, action, message, rawData, undefined, diagnosticCode);
  },
  
  info(area: DiagnosticArea, component: string, action: string, message: string, 
       rawData?: any, processedData?: any): void {
    this.logWithLevel(LogLevel.INFO, area, component, action, message, rawData, processedData);
  },
  
  debug(area: DiagnosticArea, component: string, action: string, message: string, 
        rawData?: any, processedData?: any): void {
    this.logWithLevel(LogLevel.DEBUG, area, component, action, message, rawData, processedData);
  },
  
  trace(area: DiagnosticArea, component: string, action: string, message: string, 
        rawData?: any, processedData?: any): void {
    this.logWithLevel(LogLevel.TRACE, area, component, action, message, rawData, processedData);
  },
  
  /**
   * Log input/output transformation
   */
  logTransformation(
    area: DiagnosticArea, 
    component: string, 
    transformName: string, 
    inputData: any, 
    outputData: any, 
    success: boolean = true
  ): void {
    const level = success ? LogLevel.DEBUG : LogLevel.WARN;
    const action = success ? 'Transform success' : 'Transform warning';
    const message = `${transformName}: ${success ? 'Successfully transformed data' : 'Warning during transformation'}`;
    
    this.logWithLevel(level, area, component, action, message, inputData, outputData);
  },
  
  /**
   * Log parsing attempt
   */
  logParsingAttempt(
    component: string,
    parserName: string,
    content: string,
    result: any,
    success: boolean
  ): void {
    const level = success ? LogLevel.DEBUG : LogLevel.WARN;
    const action = success ? 'Parsing success' : 'Parsing failure';
    const message = `${parserName}: ${success ? 'Successfully parsed content' : 'Failed to parse content'}`;
    
    // For content that might be too long, truncate it in the log
    const truncatedContent = typeof content === 'string' && content.length > 1000 
      ? content.substring(0, 500) + '... [truncated] ...' + content.substring(content.length - 500)
      : content;
    
    this.logWithLevel(level, DiagnosticArea.PARSER, component, action, message, truncatedContent, result);
  }
};

export default diagnosticLogger;