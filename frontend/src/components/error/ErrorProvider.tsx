'use client'

import React, { 
  createContext, 
  useContext, 
  ReactNode, 
  Component 
} from 'react'
import { useErrorReporting } from '@/lib/errorReporting'
import { ErrorBoundary } from './ErrorBoundary'

interface ErrorContextType {
  reportError: (
    error: Error,
    errorInfo?: React.ErrorInfo,
    context?: Record<string, unknown>
  ) => void
  getErrorLogs: () => any[]
  clearErrorLogs: () => void
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined)

interface ErrorProviderProps {
  children: ReactNode
}

export function ErrorProvider({ children }: ErrorProviderProps) {
  const errorReporting = useErrorReporting()

  return (
    <ErrorContext.Provider value={errorReporting}>
      {children}
    </ErrorContext.Provider>
  )
}

export function useError() {
  const context = useContext(ErrorContext)
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider')
  }
  return context
}

// Higher-order component for error tracking
export function withErrorTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string
) {
  return function WithErrorTrackingComponent(props: P) {
    const { reportError } = useError()

    return (
      <ErrorBoundary
        onError={(error, errorInfo) => {
          reportError(error, errorInfo, { componentName })
        }}
      >
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}