'use client'

import React, { useEffect } from 'react'
import { ScrollState } from '@/lib/ScrollManager'

interface AutoScrollDebugProps {
  scrollState: ScrollState
  isProcessing: boolean
  messageCount: number
}

export function AutoScrollDebug({ 
  scrollState,
  isProcessing, 
  messageCount 
}: AutoScrollDebugProps) {
  const { 
    isAutoScrollEnabled, 
    isUserScrolling, 
    isAtBottom,
    scrollPosition,
    scrollHeight,
    containerHeight,
    isAutoScrolling 
  } = scrollState

  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.search.includes('debug=scroll')) {
      console.log('[AutoScroll Debug]', {
        isAutoScrollEnabled,
        isUserScrolling,
        isAtBottom,
        isAutoScrolling,
        isProcessing,
        messageCount,
        scrollPosition,
        distanceFromBottom: scrollHeight - scrollPosition - containerHeight,
        timestamp: new Date().toISOString()
      })
    }
  }, [isAutoScrollEnabled, isUserScrolling, isAtBottom, isAutoScrolling, isProcessing, messageCount, scrollPosition, scrollHeight, containerHeight])

  if (process.env.NODE_ENV !== 'development') return null

  return (
    <div className="fixed bottom-20 right-4 bg-black/80 text-white p-3 rounded text-xs font-mono z-50 min-w-[200px]">
      <div className="font-bold mb-2 border-b border-gray-600 pb-1">Scroll Debug</div>
      <div className="space-y-1">
        <div>AutoScroll: <span className={isAutoScrollEnabled ? 'text-green-400' : 'text-red-400'}>
          {isAutoScrollEnabled ? '✅' : '❌'}
        </span></div>
        <div>User Scrolling: <span className={isUserScrolling ? 'text-yellow-400' : 'text-gray-400'}>
          {isUserScrolling ? '✅' : '❌'}
        </span></div>
        <div>At Bottom: <span className={isAtBottom ? 'text-green-400' : 'text-yellow-400'}>
          {isAtBottom ? '✅' : '❌'}
        </span></div>
        <div>Processing: {isProcessing ? '✅' : '❌'}</div>
        <div>Auto-Scrolling: <span className={isAutoScrolling ? 'text-blue-400' : 'text-gray-400'}>
          {isAutoScrolling ? '✅' : '❌'}
        </span></div>
        <div>Messages: {messageCount}</div>
        <div className="mt-2 pt-2 border-t border-gray-600 text-[10px] opacity-80">
          <div>Pos: {Math.round(scrollPosition)}px</div>
          <div>Height: {scrollHeight}px</div>
          <div>Container: {containerHeight}px</div>
          <div>From Bottom: {Math.round(scrollHeight - scrollPosition - containerHeight)}px</div>
        </div>
      </div>
    </div>
  )
}