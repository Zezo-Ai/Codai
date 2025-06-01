'use client'

import { useState, useEffect, useCallback } from 'react'
import { maskApiKey as maskKey } from '@/lib/apiKeyUtils'

// Get API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

// Get current session ID from localStorage
const getCurrentSessionId = (): string => {
  if (typeof window === 'undefined') return 'default_session'
  try {
    const sessionData = localStorage.getItem('codai_current_session')
    if (sessionData) {
      // Check if it's already a plain session ID (not JSON)
      if (!sessionData.startsWith('{') && !sessionData.startsWith('[')) {
        return sessionData
      }
      // Otherwise try to parse as JSON
      try {
        const parsed = JSON.parse(sessionData)
        return parsed.id || 'default_session'
      } catch {
        // If parsing fails, use the raw value
        return sessionData
      }
    }
  } catch (error) {
    console.warn('Failed to get session ID:', error)
  }
  return 'default_session'
}

interface UseApiKeyReturn {
  apiKey: string | null
  maskedKey: string | null
  hasApiKey: boolean
  isLoading: boolean
  isValidating: boolean
  isValid: boolean | null
  error: string | null
  setApiKey: (key: string) => Promise<void>
  clearApiKey: () => void
  testApiKey: () => Promise<boolean>
}

interface ApiKeyInfo {
  has_key: boolean
  key_hint?: string
  created_at?: string
  last_used_at?: string
  is_valid?: boolean
  label?: string
}

export function useApiKey(): UseApiKeyReturn {
  const [keyInfo, setKeyInfo] = useState<ApiKeyInfo | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isValidating, setIsValidating] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Function to load API key info
  const loadApiKeyInfo = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/api-key-info`, {
        headers: {
          'X-Session-ID': getCurrentSessionId(),
          'Content-Type': 'application/json',
        },
      })
      if (response.ok) {
        const info: ApiKeyInfo = await response.json()
        setKeyInfo(info)
        setHasApiKey(info.has_key)
        setIsValid(info.is_valid ?? null)
      }
    } catch (err) {
      console.error('Failed to load API key info:', err)
      setError('Failed to load API key information')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load API key info on mount
  useEffect(() => {
    loadApiKeyInfo()
  }, [])

  // Listen for API key changes from other components
  useEffect(() => {
    const handleKeyChange = (event: CustomEvent) => {
      // Reload the API key info when it changes
      loadApiKeyInfo()
    }

    window.addEventListener('api-key-changed', handleKeyChange as EventListener)
    
    return () => {
      window.removeEventListener('api-key-changed', handleKeyChange as EventListener)
    }
  }, [loadApiKeyInfo])

  // Set a new API key
  const setApiKey = useCallback(async (key: string, label?: string) => {
    setError(null)
    
    try {
      // Validate format
      if (!key.startsWith('sk-ant-')) {
        throw new Error('API key must start with "sk-ant-"')
      }

      // Save to backend
      const response = await fetch(`${API_BASE_URL}/api/save-api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': getCurrentSessionId(),
        },
        body: JSON.stringify({ api_key: key, label }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.message || 'Failed to save API key')
      }

      // Update local state
      const newInfo: ApiKeyInfo = {
        has_key: true,
        key_hint: result.key_hint,
        is_valid: null
      }
      setKeyInfo(newInfo)
      setHasApiKey(true)
      setIsValid(null) // Reset validation state

      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('api-key-changed', { 
        detail: { hasKey: true } 
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save API key'
      setError(message)
      throw new Error(message)
    }
  }, [])

  // Clear the API key
  const clearApiKey = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/api-key`, {
        method: 'DELETE',
        headers: {
          'X-Session-ID': getCurrentSessionId(),
          'Content-Type': 'application/json',
        },
      })
      
      setKeyInfo(null)
      setHasApiKey(false)
      setIsValid(null)
      setError(null)

      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('api-key-changed', { 
        detail: { hasKey: false } 
      }))
    } catch (err) {
      console.error('Failed to delete API key:', err)
      setError('Failed to delete API key')
    }
  }, [])

  // Test the API key
  const testApiKey = useCallback(async (): Promise<boolean> => {
    if (!hasApiKey) {
      setError('No API key set')
      return false
    }

    setIsValidating(true)
    setError(null)

    try {
      // The backend will get the key from storage automatically
      const response = await fetch(`${API_BASE_URL}/api/validate-api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': getCurrentSessionId(),
        },
        body: JSON.stringify({ api_key: 'stored' }), // Indicate to use stored key
      })

      const data = await response.json()

      if (response.ok && data.valid) {
        setIsValid(true)
        // Update key info
        if (keyInfo) {
          setKeyInfo({ ...keyInfo, is_valid: true })
        }
        return true
      } else {
        setIsValid(false)
        setError(data.message || 'Invalid API key')
        if (keyInfo) {
          setKeyInfo({ ...keyInfo, is_valid: false })
        }
        return false
      }
    } catch (err) {
      setIsValid(false)
      setError('Failed to validate API key')
      return false
    } finally {
      setIsValidating(false)
    }
  }, [hasApiKey, keyInfo])

  // Masked key for display
  const maskedKey = keyInfo?.key_hint || null

  return {
    apiKey: null, // We don't expose the actual key anymore
    maskedKey,
    hasApiKey,
    isLoading,
    isValidating,
    isValid,
    error,
    setApiKey,
    clearApiKey,
    testApiKey,
  }
}

// Hook for listening to API key changes
export function useApiKeyListener(callback: (hasKey: boolean) => void) {
  useEffect(() => {
    const handleKeyChange = (event: CustomEvent) => {
      callback(event.detail.hasKey)
    }

    window.addEventListener('api-key-changed', handleKeyChange as EventListener)
    
    return () => {
      window.removeEventListener('api-key-changed', handleKeyChange as EventListener)
    }
  }, [callback])
}