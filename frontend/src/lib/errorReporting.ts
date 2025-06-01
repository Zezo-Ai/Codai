import { logger, LogCategory } from '@/services/logger'

interface ErrorContext {
  componentName?: string
  userId?: string
  sessionId?: string
  category?: string
  additionalInfo?: Record<string, unknown>
}

interface ErrorReport {
  error: Error
  errorInfo?: React.ErrorInfo
  context: ErrorContext
  timestamp: string
  userAgent: string
  location: string
}

class ErrorReportingService {
  private static instance: ErrorReportingService
  private readonly MAX_STORED_ERRORS = 50
  private readonly STORAGE_KEY = 'codai_error_logs'

  private constructor() {
    this.cleanupOldErrors()
  }

  public static getInstance(): ErrorReportingService {
    if (!ErrorReportingService.instance) {
      ErrorReportingService.instance = new ErrorReportingService()
    }
    return ErrorReportingService.instance
  }

  private cleanupOldErrors(): void {
    try {
      const storedErrors = this.getStoredErrors()
      if (storedErrors.length > this.MAX_STORED_ERRORS) {
        const trimmedErrors = storedErrors.slice(-this.MAX_STORED_ERRORS)
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmedErrors))
      }
    } catch (error) {
      // Handle silently
    }
  }

  private getStoredErrors(): ErrorReport[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  private storeError(report: ErrorReport): void {
    try {
      const storedErrors = this.getStoredErrors()
      storedErrors.push(report)
      
      if (storedErrors.length > this.MAX_STORED_ERRORS) {
        storedErrors.shift() // Remove oldest error
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storedErrors))
    } catch (error) {
      // Handle silently
    }
  }

  public reportError(
    error: Error,
    errorInfo?: React.ErrorInfo,
    context: ErrorContext = {}
  ): void {
    const errorReport: ErrorReport = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } as Error,
      errorInfo: errorInfo ? {
        componentStack: errorInfo.componentStack,
      } : undefined,
      context: {
        ...context,
        environment: process.env.NODE_ENV,
      },
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
      location: typeof window !== 'undefined' ? window.location.href : 'unknown',
    }

    // Log using our structured logger
    logger.error(
      `Error in ${context.componentName || 'unknown component'}: ${error.message}`,
      error,
      {
        category: LogCategory.SYSTEM,
        component: context.componentName,
        errorInfo: {
          componentStack: errorInfo?.componentStack,
          type: error.name,
          location: errorReport.location,
          environment: process.env.NODE_ENV
        },
        context: {
          userId: context.userId,
          sessionId: context.sessionId,
          userAgent: errorReport.userAgent,
          ...context.additionalInfo
        }
      }
    )

    // Store locally
    this.storeError(errorReport)

    // Here you would typically send to your error tracking service
    // e.g., Sentry, LogRocket, etc.
    this.sendToErrorService(errorReport)
  }

  private async sendToErrorService(report: ErrorReport): Promise<void> {
    // Implementation for sending to your error tracking service
    // This is a placeholder that just logs to console
    try {
      // Example: Send to error tracking endpoint
      // await fetch('/api/error-tracking', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify(report),
      // })
      
      // Report ready for service
    } catch (error) {
      // Handle silently
    }
  }

  public getErrorLogs(): ErrorReport[] {
    return this.getStoredErrors()
  }

  public clearErrorLogs(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      // Handle silently
    }
  }
}

export const errorReporting = ErrorReportingService.getInstance()

// Error reporting hook
export function useErrorReporting() {
  return {
    reportError: (
      error: Error,
      errorInfo?: React.ErrorInfo,
      context?: ErrorContext
    ) => {
      errorReporting.reportError(error, errorInfo, context)
    },
    getErrorLogs: () => errorReporting.getErrorLogs(),
    clearErrorLogs: () => errorReporting.clearErrorLogs(),
  }
}