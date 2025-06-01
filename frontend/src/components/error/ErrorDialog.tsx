'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, X, ArrowUpRight } from 'lucide-react'

interface ErrorDialogProps {
  error: Error
  onClose: () => void
  onRetry?: () => void
  onReport?: () => void
}

export function ErrorDialog({ 
  error, 
  onClose, 
  onRetry, 
  onReport 
}: ErrorDialogProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 150) // Allow animation to complete
  }

  return (
    <div className={`
      fixed inset-0 z-50 flex items-center justify-center p-4
      bg-black/50 backdrop-blur-sm
      transition-opacity duration-150
      ${isVisible ? 'opacity-100' : 'opacity-0'}
    `}>
      <div className={`
        relative bg-white rounded-xl shadow-2xl max-w-md w-full
        transform transition-all duration-150
        ${isVisible ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}
      `}>
        <div className="flex items-start justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              An Error Occurred
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            {error.message}
          </p>

          {process.env.NODE_ENV === 'development' && error.stack && (
            <div className="mb-4">
              <details className="text-xs">
                <summary className="text-gray-500 hover:text-gray-700 cursor-pointer">
                  Error Details
                </summary>
                <pre className="mt-2 p-2 bg-gray-50 rounded-lg overflow-auto text-red-600">
                  {error.stack}
                </pre>
              </details>
            </div>
          )}

          <div className="flex items-center gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Try Again
              </button>
            )}

            {onReport && (
              <button
                onClick={onReport}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                Report Issue
                <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-gray-50 px-4 py-3 rounded-b-xl">
          <p className="text-xs text-gray-500">
            If this problem persists, please contact support or try refreshing the page.
          </p>
        </div>
      </div>
    </div>
  )
}