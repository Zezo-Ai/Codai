'use client'

import { useState, useEffect } from 'react'
import diagnosticLogger, { LogLevel } from '@/lib/diagnosticLogger'

/**
 * Hook to manage diagnostic panel display and keyboard shortcuts
 */
export function useDiagnostics() {
  const [isVisible, setIsVisible] = useState(false)
  
  useEffect(() => {
    // Check for diagnostic mode in query string
    const checkQueryParam = () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.has('diagnostics')) {
          setIsVisible(true)
          diagnosticLogger.setLevel(LogLevel.DEBUG)
        }
      }
    }
    
    // Check on initial load
    checkQueryParam()
    
    // Set up keyboard shortcut for toggling diagnostics panel
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+Shift+D to toggle diagnostic panel
      if (e.altKey && e.shiftKey && e.key === 'd') {
        setIsVisible(prev => !prev)
        
        // When showing, increase log level to DEBUG
        if (!isVisible) {
          diagnosticLogger.setLevel(LogLevel.DEBUG)
        }
      }
      
      // Alt+Shift+L cycles log levels
      if (e.altKey && e.shiftKey && e.key === 'l') {
        const currentLevel = diagnosticLogger.getLevel()
        const newLevel = (currentLevel % 5) + 1 // Cycle through levels 1-5
        diagnosticLogger.setLevel(newLevel)
        
        // Show level change in console
        const levelNames = ['NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE']
        console.log(`Diagnostic log level set to: ${levelNames[newLevel]}`)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    
    // Listen for popstate to check diagnostics param on navigation
    window.addEventListener('popstate', checkQueryParam)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('popstate', checkQueryParam)
    }
  }, [isVisible])
  
  return { isVisible, setIsVisible }
}

export default useDiagnostics