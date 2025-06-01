'use client'

import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, FolderSync, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  onReset?: () => void
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class SessionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    console.error('SessionErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-64 border-r border-gray-200 bg-white p-4">
          <div className="flex flex-col items-center justify-center min-h-[200px] bg-orange-50 rounded-xl p-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-orange-100 rounded-full blur-lg opacity-50" />
              <div className="relative p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full">
                <FolderSync className="h-6 w-6 text-white" />
              </div>
            </div>
            
            <h2 className="text-lg font-semibold text-orange-700 mb-2">
              Session Error
            </h2>
            
            <p className="text-sm text-orange-600 mb-4 max-w-[200px] text-center">
              {this.state.error?.message || 'Unable to load session data'}
            </p>

            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>

            {this.state.errorInfo && (
              <details className="mt-4 text-xs text-orange-600">
                <summary className="cursor-pointer hover:text-orange-700">
                  Error Details
                </summary>
                <pre className="mt-2 p-2 bg-orange-100 rounded-lg overflow-auto max-w-[200px] whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="mt-4 flex items-center gap-1.5 text-xs text-orange-600">
              <AlertCircle className="h-3 w-3" />
              <span>Try refreshing the page</span>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}