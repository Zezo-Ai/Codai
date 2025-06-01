'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { ScrollState } from '@/lib/ScrollManager'
import { Message } from './types'

interface JumpToBottomProps {
  scrollState: ScrollState
  scrollManager: { scrollToBottom: (options?: { smooth?: boolean }) => void }
  messages: Message[]
  isProcessing: boolean
}

export const JumpToBottom: React.FC<JumpToBottomProps> = ({
  scrollState,
  scrollManager,
  messages,
  isProcessing
}) => {
  const [unreadCount, setUnreadCount] = useState(0)
  const lastMessageCountRef = useRef(messages.length)
  const wasAtBottomRef = useRef(true)

  useEffect(() => {
    const currentMessageCount = messages.length
    const messageCountChanged = currentMessageCount !== lastMessageCountRef.current
    
    // If we're not at bottom and new messages arrived, increment unread
    if (!scrollState.isAtBottom && messageCountChanged && currentMessageCount > lastMessageCountRef.current) {
      const newMessages = currentMessageCount - lastMessageCountRef.current
      setUnreadCount(prev => prev + newMessages)
    }
    
    // If we're at bottom, reset unread count
    if (scrollState.isAtBottom && !wasAtBottomRef.current) {
      setUnreadCount(0)
    }
    
    // Update refs
    lastMessageCountRef.current = currentMessageCount
    wasAtBottomRef.current = scrollState.isAtBottom
  }, [messages.length, scrollState.isAtBottom])

  const show = !scrollState.isAtBottom || unreadCount > 0

  const handleClick = () => {
    if (scrollManager && scrollManager.scrollToBottom) {
      // Force scroll to bottom, even if user has scrolled
      scrollManager.scrollToBottom({ smooth: true, force: true })
      setUnreadCount(0)
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed bottom-28 right-6 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-md z-50 transition-all p-1 group flex items-center gap-0.5"
          onClick={handleClick}
          aria-label={unreadCount > 0 ? `Jump to bottom (${unreadCount} new)` : 'Jump to bottom'}
        >
          <ChevronDown className="w-3 h-3 text-gray-500 group-hover:text-gray-700" />
          {unreadCount > 0 && (
            <>
              <span className="text-xs font-medium text-gray-700 ml-1">
                {unreadCount}
              </span>
              <div className="absolute -top-1 -right-1 bg-blue-500 rounded-full w-2 h-2" />
            </>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  )
}