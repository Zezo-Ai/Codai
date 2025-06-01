'use client'

import { useState, useCallback, useMemo } from 'react'
import type { 
  ChatState, 
  Message, 
  MessageRole, 
  MessageSegment, 
  MessageType,
  ChatMetadata 
} from './types'

const DEFAULT_METADATA: ChatMetadata = {
  sessionId: '',
  category: 'chat'
}

export const initialState: ChatState = {
  messages: [],
  isProcessing: false,
  error: null,
  metadata: DEFAULT_METADATA
}

export function useInitialState() {
  return useState<ChatState>(initialState)
}

export const createMessage = (
  role: MessageRole,
  content: string,
  type: MessageType = 'text',
  metadata?: ChatMetadata
): Message => ({
  role,
  segments: [{
    type,
    content,
    id: crypto.randomUUID(),
    metadata: {
      timestamp: new Date().toISOString()
    }
  }],
  timestamp: new Date().toISOString(),
  metadata: {
    category: metadata?.category,
    sessionId: metadata?.sessionId
  }
})

export function useMessageUpdaters() {
  const updateMessageContent = useCallback((messages: Message[], content: string): Message[] => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return messages

    const lastSegment = lastMessage.segments[lastMessage.segments.length - 1]
    
    if (lastSegment?.type === 'text') {
      return [
        ...messages.slice(0, -1),
        {
          ...lastMessage,
          segments: [
            ...lastMessage.segments.slice(0, -1),
            { 
              ...lastSegment,
              content: lastSegment.content + content
            }
          ]
        }
      ]
    }
    
    return [
      ...messages.slice(0, -1),
      {
        ...lastMessage,
        segments: [
          ...lastMessage.segments,
          { 
            type: 'text', 
            content,
            id: crypto.randomUUID(),
            metadata: {
              timestamp: new Date().toISOString()
            }
          }
        ]
      }
    ]
  }, [])

  const updateMessageWithScreenshot = useCallback((messages: Message[], screenshot: string): Message[] => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return messages

    return [
      ...messages.slice(0, -1),
      {
        ...lastMessage,
        segments: [
          ...lastMessage.segments,
          { 
            type: 'screenshot', 
            content: screenshot,
            id: crypto.randomUUID(),
            metadata: {
              timestamp: new Date().toISOString()
            }
          }
        ]
      }
    ]
  }, [])

  return useMemo(() => ({
    updateMessageContent,
    updateMessageWithScreenshot
  }), [updateMessageContent, updateMessageWithScreenshot])
}

export function createThinkingMessage(metadata?: ChatMetadata): Message {
  return {
    role: 'assistant',
    segments: [],
    timestamp: new Date().toISOString(),
    isThinking: true,
    metadata: {
      category: metadata?.category,
      sessionId: metadata?.sessionId
    }
  }
}