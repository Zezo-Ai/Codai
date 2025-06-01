'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NotificationProps {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  duration?: number
  onRemove: (id: string) => void
}

const icons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle
}

const styles = {
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  error: 'bg-red-50 text-red-800 border-red-200'
}

const iconStyles = {
  info: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400'
}

export function Notification({
  id,
  type = 'info',
  message,
  duration = 5000,
  onRemove
}: NotificationProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isLeaving, setIsLeaving] = useState(false)

  const Icon = icons[type]

  useEffect(() => {
    if (duration) {
      const timer = setTimeout(() => {
        setIsLeaving(true)
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [duration])

  useEffect(() => {
    if (isLeaving) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        onRemove(id)
      }, 300) // Match the transition duration

      return () => clearTimeout(timer)
    }
  }, [isLeaving, id, onRemove])

  if (!isVisible) return null

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 p-4 pr-8 rounded-lg border shadow-lg',
        styles[type],
        isLeaving && 'animate-fade-out',
        'transform transition-all duration-300'
      )}
      role="alert"
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0', iconStyles[type])} />
      <p className="text-sm font-medium">{message}</p>
      <button
        onClick={() => setIsLeaving(true)}
        className={cn(
          'absolute right-2 top-2 p-1 rounded-full hover:bg-black/5',
          'transition-colors duration-200'
        )}
        aria-label="Close notification"
      >
        <X className={cn('h-4 w-4', iconStyles[type])} />
      </button>
    </div>
  )
}