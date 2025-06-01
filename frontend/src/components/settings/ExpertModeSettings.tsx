'use client'

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Target, Info, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

export function ExpertModeSettings() {
  const [expertModeEnabled, setExpertModeEnabledState] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load current setting from server on mount
  useEffect(() => {
    loadServerConfig()
  }, [])

  const loadServerConfig = async () => {
    setInitialLoading(true)
    setError(null)
    try {
      const result = await api.chat.getConfig()
      const enabled = result.data?.expert_mode?.enabled || false
      setExpertModeEnabledState(enabled)
    } catch (error) {
      console.error('Failed to load expert mode config:', error)
      setError('Failed to load configuration from server')
    } finally {
      setInitialLoading(false)
    }
  }

  const handleToggle = async (enabled: boolean) => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await api.chat.updateConfig({
        expert_mode: { enabled }
      })
      
      if (result.ok) {
        // Update local state with server response
        const serverEnabled = result.data?.expert_mode?.enabled
        setExpertModeEnabledState(serverEnabled)
        
        // Clear localStorage to ensure server config takes precedence
        localStorage.removeItem('expertModeEnabled')
        localStorage.removeItem('expertModeConfigFetched')
        localStorage.removeItem('serverExpertModeConfig')
        
        // Update cached server config
        localStorage.setItem('serverExpertModeConfig', JSON.stringify({
          enabled: serverEnabled,
          fetchedAt: Date.now()
        }))
        
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('expertModeConfigUpdated', { 
          detail: { enabled: serverEnabled, source: 'settings' } 
        }))
      }
    } catch (error) {
      console.error('Failed to update expert mode setting:', error)
      setError('Failed to save configuration to server')
      // Revert the toggle
      setExpertModeEnabledState(!enabled)
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
          <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Expert Mode
          </h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-gray-500">Loading configuration...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
        <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Expert Mode
        </h3>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <label 
                htmlFor="expert-mode-toggle" 
                className="text-sm font-medium text-gray-900 dark:text-gray-100"
              >
                Enable Expert Mode
              </label>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              When enabled, AI analyzes requests to determine optimal domain expertise and responds with enhanced knowledge. This affects all conversations globally.
            </p>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              role="switch"
              aria-checked={expertModeEnabled}
              disabled={loading || initialLoading}
              onClick={() => handleToggle(!expertModeEnabled)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed
                ${expertModeEnabled ? 'bg-blue-600' : 'bg-gray-200'}
                ${loading ? 'cursor-wait' : 'cursor-pointer'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${expertModeEnabled ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
            {loading && (
              <div className="ml-2 text-sm text-gray-500">
                Updating...
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">How Expert Mode Works:</p>
              <ul className="space-y-1 text-xs">
                <li>• <strong>Phase 1:</strong> Analyzes your request to identify the domain (e.g., software development, mathematics, etc.)</li>
                <li>• <strong>Phase 2:</strong> Responds with enhanced expertise specific to that domain</li>
                <li>• <strong>Result:</strong> More accurate, detailed, and contextually appropriate responses</li>
              </ul>
              <p className="mt-2 text-xs font-medium">
                💡 This setting is saved to the server configuration and applies globally.
              </p>
            </div>
          </div>
        </div>

        {expertModeEnabled && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
              <Target className="w-4 h-4" />
              <span className="text-sm font-medium">Expert mode is currently enabled</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}