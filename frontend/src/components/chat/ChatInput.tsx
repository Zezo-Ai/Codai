'use client'

import { Command, Send, StopCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ChatInputProps } from './types'
import type { TokenInfo } from '@/types/token-metrics'
import { TokenCount } from './TokenCount'

export function ChatInput({ 
  onSend, 
  onStop, 
  isProcessing, 
  disabled = false,
  placeholder = "Type a command or ask a question...",
  maxLength = 200000,
  tokenInfo
}: ChatInputProps) {
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (disabled) return

    try {
      if (isProcessing) {
        await onStop()
        return
      }

      const trimmedMessage = message.trim()
      if (trimmedMessage) {
        await onSend(trimmedMessage)
        setMessage('')
      }
    } catch (error) {
      console.error('Error during submission:', error instanceof Error ? error.message : error)
    }
  }

  const isDisabled = disabled || (!isProcessing && !message.trim())

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="flex items-center space-x-3">
        <div className={cn(
          "flex-1 flex items-center space-x-2 bg-gray-50 rounded-xl",
          disabled && "opacity-75"
        )}>
          <div className="flex items-center min-h-[44px] w-full px-4">
            {disabled ? (
              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
            ) : (
              <Command className="h-5 w-5 text-gray-400 flex-shrink-0" />
            )}
            <input
              type="text"
              id="chat-input"
              name="chat-input"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
              placeholder={disabled ? "Session loading..." : placeholder}
              className={cn(
                "flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 placeholder-gray-500 ml-2",
                disabled && "cursor-not-allowed"
              )}
              disabled={disabled || isProcessing}
              maxLength={maxLength}
              aria-label="Chat input"
              autoComplete="off"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isDisabled}
          className={cn(
            "relative min-h-[44px] w-[44px] rounded-xl transition-all duration-200",
            "flex items-center justify-center flex-shrink-0",
            {
              'bg-red-500 hover:bg-red-600 shadow-lg hover:shadow-red-500/25': isProcessing,
              'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:shadow-lg hover:shadow-indigo-500/25': !isProcessing
            },
            "text-white",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:shadow-none",
            "group"
          )}
          title={isProcessing ? 'Stop generating' : 'Send message'}
          aria-label={isProcessing ? 'Stop generating' : 'Send message'}
        >
          {isProcessing ? (
            <>
              <StopCircle className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              <span className="sr-only">Stop generating</span>
              <div className="absolute -top-1 -right-1 w-2 h-2">
                <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></div>
                <div className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></div>
              </div>
            </>
          ) : (
            <>
              <Send className={cn(
                "h-5 w-5 transition-transform duration-200",
                !isDisabled && "group-hover:scale-110"
              )} />
              <span className="sr-only">Send message</span>
            </>
          )}
        </button>
      </form>
      <div className="flex flex-col space-y-1">
        <div className="flex justify-between items-center">
          {/* Token count - always visible */}
          <TokenCount tokenInfo={tokenInfo} />
          
          {/* Character count - only when typing */}
          {message.length > 0 && (
            <span className={cn(
              "text-xs",
              message.length >= maxLength ? "text-red-500" : "text-gray-500"
            )}>
              {message.length}/{maxLength}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}