'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Notification } from './Notification'
import { notifications } from '@/lib/notifications'
import { cn } from '@/lib/utils'

interface NotificationItem {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  duration?: number
}

export function NotificationContainer() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    
    // Subscribe to notifications
    const unsubscribe = notifications.subscribe((notification) => {
      setItems(prev => [...prev, notification])
    })

    return () => {
      unsubscribe()
      setIsMounted(false)
    }
  }, [])

  const handleRemove = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  // Only render in browser
  if (!isMounted) return null

  // Create portal to render notifications at the root level
  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'fixed z-50 flex flex-col items-center gap-2 p-4',
        'top-4 right-4 left-4 sm:left-auto sm:w-full sm:max-w-sm',
        items.length === 0 ? 'pointer-events-none' : 'pointer-events-auto'
      )}
      style={{
        pointerEvents: items.length === 0 ? 'none' : 'auto',
      }}
    >
      {items.map(({ id, type, message, duration }) => (
        <Notification
          key={id}
          id={id}
          type={type}
          message={message}
          duration={duration}
          onRemove={handleRemove}
        />
      ))}
    </div>,
    document.body
  )
}