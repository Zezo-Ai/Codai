'use client'

import { useEffect } from 'react'
import { logger, LogCategory } from '@/services/logger'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error using our logger
    logger.error('Global error boundary caught an error', error, {
      category: LogCategory.SYSTEM,
      component: 'GlobalErrorBoundary',
      errorInfo: {
        type: error.name,
        digest: error.digest,
        environment: process.env.NODE_ENV
      }
    })
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="rounded-lg bg-white p-8 shadow-lg">
        <h2 className="mb-4 text-2xl font-bold text-red-600">Something went wrong!</h2>
        <div className="mb-4 text-gray-600">
          {process.env.NODE_ENV === 'development' ? (
            <pre className="mt-2 rounded bg-gray-50 p-4 text-sm">
              {error.message}
              {error.stack && (
                <>
                  <br />
                  <br />
                  {error.stack}
                </>
              )}
            </pre>
          ) : (
            <p>An error occurred. Please try again later.</p>
          )}
        </div>
        <button
          onClick={reset}
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Try again
        </button>
      </div>
    </div>
  )
}