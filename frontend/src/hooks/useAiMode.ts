'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  AiMode, 
  AI_MODE_TO_MODEL, 
  AVAILABLE_MODES, 
  DEFAULT_MODE 
} from '@/config/aiModels'
import { getFromStorage, setInStorage } from '@/lib/storageUtils'

const AI_MODE_STORAGE_KEY = 'codai-ai-mode'


interface UseAiModeReturn {
  currentMode: AiMode
  setMode: (mode: AiMode) => void
  currentModel: string
  isAvailable: (mode: AiMode) => boolean
  availableModes: AiMode[]
  error: string | null
  clearError: () => void
}

export function useAiMode(): UseAiModeReturn {
  const [currentMode, setCurrentMode] = useState<AiMode>(DEFAULT_MODE)
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load saved mode from storage on mount
  useEffect(() => {
    const savedMode = getFromStorage(AI_MODE_STORAGE_KEY) as AiMode
    if (savedMode && AVAILABLE_MODES.includes(savedMode)) {
      setCurrentMode(savedMode)
    }
    setMounted(true)
  }, [])

  // Save mode to storage when it changes
  useEffect(() => {
    if (mounted) {
      setInStorage(AI_MODE_STORAGE_KEY, currentMode)
    }
  }, [currentMode, mounted])

  const setMode = useCallback((mode: AiMode) => {
    // Clear any existing errors
    setError(null)
    
    // Validate mode
    if (!AVAILABLE_MODES.includes(mode)) {
      const errorMsg = `Invalid AI mode: ${mode}. Using default mode.`
      console.warn(errorMsg)
      setError(errorMsg)
      mode = DEFAULT_MODE
    }
    
    try {
      setCurrentMode(mode)
      
      // Emit custom event for other components to listen to mode changes
      window.dispatchEvent(new CustomEvent('ai-mode-changed', { 
        detail: { 
          mode, 
          model: AI_MODE_TO_MODEL[mode] 
        } 
      }))
    } catch (err) {
      const errorMsg = 'Failed to switch AI mode. Please try again.'
      console.error('Error switching AI mode:', err)
      setError(errorMsg)
      // Keep current mode on error
    }
  }, [])

  const isAvailable = useCallback((mode: AiMode) => {
    return AVAILABLE_MODES.includes(mode)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const currentModel = AI_MODE_TO_MODEL[currentMode]

  return {
    currentMode,
    setMode,
    currentModel,
    isAvailable,
    availableModes: AVAILABLE_MODES,
    error,
    clearError
  }
}

// Hook for listening to AI mode changes across components
export function useAiModeListener(callback: (mode: AiMode, model: string) => void) {
  useEffect(() => {
    const handleModeChange = (event: CustomEvent) => {
      callback(event.detail.mode, event.detail.model)
    }

    window.addEventListener('ai-mode-changed', handleModeChange as EventListener)
    
    return () => {
      window.removeEventListener('ai-mode-changed', handleModeChange as EventListener)
    }
  }, [callback])
}

