'use client'

import { useState, useRef, useEffect } from 'react'
import { Download, Upload, CheckCircle, AlertCircle, Computer } from 'lucide-react'
import type { StoredSession } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { featureFlags } from '@/lib/featureFlags'

interface SessionActionsProps {
  onExport: () => Promise<void>
  onImport: (data: string) => Promise<void>
  className?: string
  disabled?: boolean
}

export function SessionActions({ 
  onExport, 
  onImport, 
  className = '',
  disabled = false 
}: SessionActionsProps) {
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [computerUseEnabled, setComputerUseEnabled] = useState(true)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load initial computer use state
  useEffect(() => {
    const loadComputerUseState = async () => {
      const isEnabled = await featureFlags.checkFeatureAvailability('computerUse')
      setComputerUseEnabled(isEnabled)
    }
    loadComputerUseState()
  }, [])

  const handleExport = async () => {
    if (disabled || isLoading) return
    setIsLoading(true)
    try {
      await onExport()
      setStatus({ 
        type: 'success', 
        message: 'Sessions exported successfully' 
      })
      setTimeout(() => setStatus({ type: null, message: '' }), 3000)
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: 'Failed to export sessions' 
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || isLoading) return
    setIsLoading(true)
    try {
      const file = event.target.files?.[0]
      if (!file) return

      const text = await file.text()
      await onImport(text)
      
      setStatus({ 
        type: 'success', 
        message: 'Sessions imported successfully' 
      })
      setTimeout(() => setStatus({ type: null, message: '' }), 3000)
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to import sessions' 
      })
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const toggleComputerUse = async () => {
    const newState = !computerUseEnabled
    const updated = featureFlags.toggleComputerUse()
    setComputerUseEnabled(updated)
    setStatus({ 
      type: 'success', 
      message: `Computer use ${updated ? 'enabled' : 'disabled'}` 
    })
    setTimeout(() => setStatus({ type: null, message: '' }), 3000)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          disabled={disabled || isLoading}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors",
            (disabled || isLoading) && "opacity-50 cursor-not-allowed"
          )}
        >
          <Download className={cn("h-4 w-4", isLoading && "animate-bounce")} />
          {isLoading ? 'Exporting...' : 'Export Sessions'}
        </button>

        <label className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer",
          (disabled || isLoading) && "opacity-50 cursor-not-allowed"
        )}>
          <Upload className="h-4 w-4" />
          {isLoading ? 'Importing...' : 'Import Sessions'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={disabled || isLoading}
            className="hidden"
          />
        </label>

        <button
          onClick={toggleComputerUse}
          disabled={disabled}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
            computerUseEnabled ? "text-green-600 hover:bg-green-50" : "text-gray-600 hover:bg-gray-50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          title={`Computer use is ${computerUseEnabled ? 'enabled' : 'disabled'}`}
        >
          <Computer className="h-4 w-4" />
          {computerUseEnabled ? 'Computer: On' : 'Computer: Off'}
        </button>
      </div>

      {status.type && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
          status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
          "animate-fadeIn"
        )}>
          {status.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {status.message}
        </div>
      )}
    </div>
  )
}