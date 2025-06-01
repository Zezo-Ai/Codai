'use client'

import { useEffect } from 'react'
import { initializeExpertMode } from '@/lib/expertMode'
import { initializeExpertModeGlobals } from '@/lib/expertModeGlobal'

/**
 * Component to initialize expert mode configuration and global functions
 * Should be rendered once in the app layout
 */
export function ExpertModeInitializer() {
  useEffect(() => {
    // Initialize expert mode with server configuration
    initializeExpertMode().catch(console.warn)
    
    // Initialize global functions for UI
    initializeExpertModeGlobals()
  }, [])
  
  return null // This component doesn't render anything
}