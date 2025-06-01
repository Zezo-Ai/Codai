'use client'

import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { ScrollManager } from '@/lib/ScrollManager'

interface KeyboardNavigationProps {
  scrollManager: ScrollManager
  enabled?: boolean
}

export function KeyboardNavigation({ 
  scrollManager, 
  enabled = true 
}: KeyboardNavigationProps) {
  // Get container reference for calculations
  const getContainer = () => {
    const container = document.querySelector('.chat-container') as HTMLElement
    return container
  }

  const shortcuts = {
    // Page navigation
    'PageUp': () => {
      const container = getContainer()
      if (container) {
        const scrollAmount = container.clientHeight * 0.8
        scrollManager.scrollTo(
          Math.max(0, container.scrollTop - scrollAmount),
          { smooth: true }
        )
      }
    },
    
    'PageDown': () => {
      const container = getContainer()
      if (container) {
        const scrollAmount = container.clientHeight * 0.8
        scrollManager.scrollTo(
          Math.min(
            container.scrollHeight - container.clientHeight,
            container.scrollTop + scrollAmount
          ),
          { smooth: true }
        )
      }
    },
    
    // Home/End
    'Home': () => {
      scrollManager.scrollTo(0, { smooth: true })
    },
    
    'End': () => {
      scrollManager.scrollToBottom({ smooth: true })
    },
    
    // Space navigation (like in browsers)
    'Space': () => {
      const container = getContainer()
      if (container) {
        const scrollAmount = container.clientHeight * 0.8
        scrollManager.scrollTo(
          container.scrollTop + scrollAmount,
          { smooth: true }
        )
      }
    },
    
    'Shift+Space': () => {
      const container = getContainer()
      if (container) {
        const scrollAmount = container.clientHeight * 0.8
        scrollManager.scrollTo(
          Math.max(0, container.scrollTop - scrollAmount),
          { smooth: true }
        )
      }
    },
    
    // Vim-style navigation (optional)
    'j': () => {
      const container = getContainer()
      if (container) {
        scrollManager.scrollTo(
          container.scrollTop + 100,
          { smooth: true }
        )
      }
    },
    
    'k': () => {
      const container = getContainer()
      if (container) {
        scrollManager.scrollTo(
          Math.max(0, container.scrollTop - 100),
          { smooth: true }
        )
      }
    },
    
    // Quick jumps
    'g': () => {
      // Wait for second 'g' press for 'gg' command
      const handleSecondKey = (e2: KeyboardEvent) => {
        if (e2.key === 'g') {
          e2.preventDefault()
          scrollManager.scrollTo(0, { smooth: true })
        }
        window.removeEventListener('keydown', handleSecondKey)
      }
      
      window.addEventListener('keydown', handleSecondKey)
      
      // Remove listener after 500ms if no second key
      setTimeout(() => {
        window.removeEventListener('keydown', handleSecondKey)
      }, 500)
    },
    
    'G': () => {
      scrollManager.scrollToBottom({ smooth: true })
    },
    
    // Message navigation
    'n': () => {
      scrollManager.navigateToMessage('next')
    },
    
    'p': () => {
      scrollManager.navigateToMessage('previous')
    },
  }

  useKeyboardShortcuts(enabled ? shortcuts : {}, [scrollManager, enabled])
  
  return null
}