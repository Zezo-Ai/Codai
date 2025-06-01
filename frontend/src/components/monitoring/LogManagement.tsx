'use client'

import { FC, useState } from 'react'
import { LogStatus } from './LogStatus'
import { Trash2, Archive, Download, CleanupIcon, AlertCircle } from 'lucide-react'

interface Props {
  category?: string
  onSuccess?: () => void
}

export const LogManagement: FC<Props> = ({ category, onSuccess }) => {
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<{text: string; type: 'success' | 'error'} | null>(null)

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleOperation = async (operation: string, endpoint: string, baseOnly: boolean = false) => {
    try {
      setIsLoading(prev => ({ ...prev, [operation]: true }))
      
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
      const url = `${baseUrl}/api/logs/${endpoint}`
      const params = new URLSearchParams()
      if (category) {
        params.append('category', category)
        // Add special handling for base logs
        if (baseOnly) {
          params.append('base_only', 'true')
        }
      }
      
      const response = await fetch(`${url}${params.toString() ? `?${params.toString()}` : ''}`, {
        method: endpoint === 'cleanup' ? 'DELETE' : 'POST'
      })
      
      if (!response.ok) {
        throw new Error('Operation failed')
      }
      
      const data = await response.json()
      showMessage(data.message, 'success')
      
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : 'Operation failed',
        'error'
      )
    } finally {
      setIsLoading(prev => ({ ...prev, [operation]: false }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Log Status */}
      <div className="border rounded-lg p-4 bg-white">
        <h3 className="text-lg font-medium mb-4">Log Files Status</h3>
        <LogStatus />
      </div>

      {/* Actions */}
      <div className="border rounded-lg p-4 bg-white">
        <h3 className="text-lg font-medium mb-4">Log Management Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
          onClick={() => handleOperation('clear', 'clear')}
          disabled={isLoading.clear}
          className={`px-3 py-2 border rounded-md flex items-center gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200
            ${isLoading.clear ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Trash2 className="w-4 h-4" />
          <span>{isLoading.clear ? 'Clearing...' : 'Clear Logs'}</span>
        </button>

        <button
          onClick={() => handleOperation('archive', 'archive')}
          disabled={isLoading.archive}
          className={`px-3 py-2 border rounded-md flex items-center gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200
            ${isLoading.archive ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Archive className="w-4 h-4" />
          <span>{isLoading.archive ? 'Archiving...' : 'Archive Logs'}</span>
        </button>

        <button
          onClick={() => handleOperation('download', 'download')}
          disabled={isLoading.download}
          className={`px-3 py-2 border rounded-md flex items-center gap-2 hover:bg-green-50 hover:text-green-600 hover:border-green-200
            ${isLoading.download ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Download className="w-4 h-4" />
          <span>{isLoading.download ? 'Preparing...' : 'Download Logs'}</span>
        </button>

        <button
          onClick={() => handleOperation('cleanup', 'cleanup')}
          disabled={isLoading.cleanup}
          className={`px-3 py-2 border rounded-md flex items-center gap-2 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200
            ${isLoading.cleanup ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Trash2 className="w-4 h-4" />
          <span>{isLoading.cleanup ? 'Cleaning...' : 'Clean Old Archives'}</span>
        </button>
      </div>

      </div>

      {/* Message */}
      {message && (
        <div className={`mt-4 p-4 rounded-md flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          <AlertCircle className="w-4 h-4" />
          <span>{message.text}</span>
        </div>
      )}
    </div>
  )
}