import { useEffect, useRef } from 'react'

interface KeyboardShortcuts {
  [key: string]: (event: KeyboardEvent) => void
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcuts,
  dependencies: any[] = []
) {
  const shortcutsRef = useRef(shortcuts)
  
  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // Build key combination string
      const keys: string[] = []
      if (event.ctrlKey) keys.push('Ctrl')
      if (event.altKey) keys.push('Alt')
      if (event.shiftKey) keys.push('Shift')
      if (event.metaKey) keys.push('Meta')
      
      // Add the actual key
      if (event.key === ' ') {
        keys.push('Space')
      } else if (event.key === 'ArrowUp') {
        keys.push('Up')
      } else if (event.key === 'ArrowDown') {
        keys.push('Down')
      } else {
        keys.push(event.key)
      }
      
      const combination = keys.join('+')
      
      // Check for exact match
      if (shortcutsRef.current[combination]) {
        event.preventDefault()
        shortcutsRef.current[combination](event)
        return
      }
      
      // Check for key without modifiers
      if (shortcutsRef.current[event.key]) {
        event.preventDefault()
        shortcutsRef.current[event.key](event)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, dependencies)
}