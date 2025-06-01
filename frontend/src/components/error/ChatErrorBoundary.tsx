'use client'

import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, MessageSquare, RefreshCw } from 'lucide-react'

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

export class ChatErrorBoundary extends Component<Props, State> {
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
    console.error('ChatErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 p-4">
          <div className="flex flex-col items-center justify-center min-h-[400px] bg-red-50 rounded-xl p-8">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-red-100 rounded-full blur-lg opacity-50" />
              <div className="relative p-4 bg-gradient-to-br from-red-500 to-red-600 rounded-full">
                <MessageSquare className="h-8 w-8 text-white" />
              </div>
            </div>
            
            <h2 className="text-xl font-semibold text-red-700 mb-2">
              Chat Error
            </h2>
            
            <p className="text-sm text-red-600 mb-6 max-w-md text-center">
              {this.state.error?.message || 'An error occurred in the chat interface'}
            </p>

            <div className="flex flex-col items-center gap-4">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-6 py-2 font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Restart Chat
              </button>

              {this.state.errorInfo && (
                <details className="text-xs text-red-600 max-w-md">
                  <summary className="cursor-pointer hover:text-red-700">
                    Technical Details
                  </summary>
                  <pre className="mt-2 p-4 bg-red-100 rounded-lg overflow-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="mt-8 flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span>If this error persists, please contact support</span>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}