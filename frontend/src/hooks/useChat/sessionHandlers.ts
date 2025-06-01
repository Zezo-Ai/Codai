'use client'

import { useEffect, useCallback, useRef } from 'react'
import { sessionManager } from '@/lib/sessionManager'
import type { Message, ChatMetadata } from './types'

export type SessionHandlerDependencies = {
  reportError: (error: Error, context?: unknown, metadata?: Record<string, unknown>) => void
}

export type SessionMetadata = {
  sessionId: string
  category: string
  lastAccessed: string
  lastModified: string
  messageCount: number
  syncStatus: 'pending' | 'synced' | 'failed'
}

export function useSessionPersistence(
  messages: Message[],
  metadata: ChatMetadata | undefined,
  deps: SessionHandlerDependencies
) {
  // Use ref to track the last sync time to prevent unnecessary syncs
  const lastSyncRef = useRef<number>(0)
  const SYNC_INTERVAL = 1000 // 1 second minimum between syncs

  const createSessionMetadata = useCallback((): SessionMetadata => ({
    sessionId: metadata?.sessionId || '',
    category: metadata?.category || 'chat',
    lastAccessed: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    messageCount: messages.length,
    syncStatus: 'pending'
  }), [metadata?.sessionId, metadata?.category, messages.length])

  // Track state for persistence
  const stateRef = useRef<{
    currentSessionId?: string
    lastSyncTime: number
    lastMessageLength: number
  }>({
    lastSyncTime: 0,
    lastMessageLength: 0
  })
  
  const persistMessages = useCallback(async (force = false) => {
    if (!metadata?.sessionId || messages.length === 0) return
    
    const lastMsg = messages[messages.length - 1]
    const currentLength = lastMsg?.segments?.reduce((acc: number, s: any) => acc + (s.content?.length || 0), 0) || 0
    
    // Check for session switch or content update
    const isSessionSwitch = stateRef.current.currentSessionId !== metadata.sessionId
    const hasNewContent = currentLength > stateRef.current.lastMessageLength
    const isComplete = lastMsg?.isComplete
    const now = Date.now()

    if (isSessionSwitch) {
      stateRef.current = {
        currentSessionId: metadata.sessionId,
        lastSyncTime: 0,
        lastMessageLength: currentLength
      }
    }

    // Persist if:
    // - Forced persist OR
    // - Session switch OR
    // - New content + enough time passed OR
    // - Message just completed
    if (!force && 
        !isSessionSwitch && 
        !isComplete &&
        (!hasNewContent || now - stateRef.current.lastSyncTime < SYNC_INTERVAL)) return
    
    stateRef.current.lastSyncTime = now
    stateRef.current.lastMessageLength = currentLength

    try {
      await sessionManager.persistSession(
        metadata.sessionId,
        messages,
        createSessionMetadata()
      )
    } catch (error) {
      // Handle error silently
      deps.reportError(
        error instanceof Error ? error : new Error('Failed to persist messages'),
        undefined,
        {
          componentName: 'ChatHook',
          action: 'persistMessages',
          sessionId: metadata.sessionId,
          messageCount: messages.length,
          timestamp: new Date().toISOString()
        }
      )
    }
  }, [messages, metadata?.sessionId, deps, createSessionMetadata])

  // Persist messages when they change
  useEffect(() => {
    const timeoutId = setTimeout(persistMessages, 100) // Debounce persistence
    return () => clearTimeout(timeoutId)
  }, [persistMessages])

  // Persist messages before window unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      persistMessages()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [persistMessages])

  return {
    persistMessages // Expose for manual persistence if needed
  }
}

export class SessionManager {
  private static instance: SessionManager
  private syncQueue: Map<string, Promise<void>>

  private constructor() {
    this.syncQueue = new Map()
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  async queueSync(
    sessionId: string, 
    messages: Message[], 
    metadata: SessionMetadata
  ): Promise<void> {
    const currentSync = this.syncQueue.get(sessionId)
    if (currentSync) {
      await currentSync
    }

    const syncPromise = sessionManager.persistSession(sessionId, messages, metadata)
    this.syncQueue.set(sessionId, syncPromise)

    try {
      await syncPromise
    } finally {
      this.syncQueue.delete(sessionId)
    }
  }

  async syncSession(
    sessionId: string,
    messages: Message[],
    metadata: SessionMetadata
  ): Promise<void> {
    return this.queueSync(sessionId, messages, metadata)
  }
}