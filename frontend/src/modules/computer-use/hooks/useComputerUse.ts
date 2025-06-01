import { useState, useEffect, useCallback } from 'react'

// Common storage key to be used across components
export const COMPUTER_USE_STORAGE_KEY = 'computer_use_enabled'

export function useComputerUse() {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    // Initialize from localStorage if available, default to true
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(COMPUTER_USE_STORAGE_KEY)
      return stored !== null ? stored === 'true' : true
    }
    return true
  })
  
  const [isLoading, setIsLoading] = useState(false)

  // Use useCallback to memoize the toggle function
  const toggle = useCallback(() => {
    setIsEnabled(prev => {
      const newState = !prev
      // Store as string 'true' or 'false'
      if (typeof window !== 'undefined') {
        localStorage.setItem(COMPUTER_USE_STORAGE_KEY, String(newState))
      }
      return newState
    })
  }, []) // No dependencies needed

  // Handle storage changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === COMPUTER_USE_STORAGE_KEY && e.newValue !== null) {
        setIsEnabled(e.newValue === 'true')
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return {
    isEnabled,
    isLoading,
    toggle
  }
}