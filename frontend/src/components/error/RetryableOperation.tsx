'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, Check } from 'lucide-react'

interface RetryableOperationProps {
  operation: () => Promise<any>
  onSuccess?: (result: any) => void
  onError?: (error: Error) => void
  maxRetries?: number
  retryDelay?: number
  errorMessage?: string
  children?: React.ReactNode
}

interface RetryState {
  status: 'idle' | 'loading' | 'success' | 'error'
  attempts: number
  error: Error | null
}

export function RetryableOperation({
  operation,
  onSuccess,
  onError,
  maxRetries = 3,
  retryDelay = 1000,
  errorMessage = 'Operation failed',
  children
}: RetryableOperationProps) {
  const [state, setState] = useState<RetryState>({
    status: 'idle',
    attempts: 0,
    error: null
  })

  const executeOperation = async () => {
    setState(prev => ({ ...prev, status: 'loading' }))

    try {
      const result = await operation()
      setState({ status: 'success', attempts: 0, error: null })
      onSuccess?.(result)
    } catch (error) {
      setState(prev => ({
        status: 'error',
        attempts: prev.attempts + 1,
        error: error instanceof Error ? error : new Error(String(error))
      }))
    }
  }

  useEffect(() => {
    if (state.status === 'error' && state.attempts < maxRetries) {
      const timer = setTimeout(() => {
        executeOperation()
      }, retryDelay * state.attempts)

      return () => clearTimeout(timer)
    }

    if (state.status === 'error' && state.attempts >= maxRetries) {
      onError?.(state.error!)
    }
  }, [state.status, state.attempts])

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">
          {state.attempts > 0 
            ? `Retrying... (Attempt ${state.attempts}/${maxRetries})`
            : 'Processing...'}
        </span>
      </div>
    )
  }

  if (state.status === 'error' && state.attempts >= maxRetries) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm">{errorMessage}</span>
        <button
          onClick={() => {
            setState({ status: 'idle', attempts: 0, error: null })
            executeOperation()
          }}
          className="px-3 py-1 text-xs font-medium text-red-600 hover:text-red-700 
                     hover:bg-red-50 rounded-md transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (state.status === 'success') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <Check className="h-4 w-4" />
        <span className="text-sm">Operation completed successfully</span>
      </div>
    )
  }

  return children || null
}