'use client'

import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class SidebarErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Sidebar error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-64 border-r border-gray-200 bg-white flex flex-col p-4">
          <div className="flex items-center space-x-2 text-red-600 mb-4">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="font-medium">Something went wrong</h3>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
            {this.state.error?.message || 'An error occurred in the sidebar'}
          </p>

          <button
            onClick={() => {
              this.props.onReset?.()
              this.setState({ hasError: false, error: null })
            }}
            className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm hover:bg-indigo-100 transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}