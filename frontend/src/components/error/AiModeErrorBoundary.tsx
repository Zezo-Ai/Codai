'use client'

import React, { Component, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { DEFAULT_MODE } from '@/config/aiModels'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class AiModeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AI Mode Error:', error, errorInfo)
    
    // Log to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      // You can add error reporting service here
      console.error('AI Mode component crashed:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      })
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-yellow-700 bg-yellow-50 rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span>AI mode selector unavailable. Using {DEFAULT_MODE} mode.</span>
        </div>
      )
    }

    return this.props.children
  }
}