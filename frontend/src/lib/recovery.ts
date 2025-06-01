'use client'

import { storage } from './storage'
import { sessionManager } from './sessionManager'
import { recoveryAnalytics } from './recoveryAnalytics'
import type { Message, ChatState } from '@/components/chat/types'

export class RecoveryStrategy {
  private static readonly MAX_RETRIES = 3
  private static readonly RETRY_DELAY = 1000 // milliseconds
  private static readonly BACKUP_DELAY = 5000 // 5 seconds

  /**
   * Attempt to recover chat state
   */
  static async recoverChatState(): Promise<Partial<ChatState>> {
    try {
      const startTime = await recoveryAnalytics.trackRecoveryAttempt(
        'system',
        'indexeddb',
        'ChatState'
      )

      // Try IndexedDB first
      const sessionId = storage.getCurrentSession()
      if (sessionId) {
        const sessionData = await sessionManager.retrieveSession(sessionId)
        if (sessionData?.messages && sessionData?.metadata) {
          recoveryAnalytics.trackRecoverySuccess(
            'system',
            'indexeddb',
            startTime,
            sessionData.messages,
            'ChatState'
          )
          return {
            messages: sessionData.messages,
            metadata: {
              sessionId,
              category: sessionData.metadata.category || 'chat'
            }
          }
        }
      }

      // Fallback to storage
      const fallbackStartTime = await recoveryAnalytics.trackRecoveryAttempt(
        'system',
        'localstorage',
        'ChatState'
      )
      
      const storedState = await storage.restoreState()
      if (storedState.messages && storedState.metadata) {
        recoveryAnalytics.trackRecoverySuccess(
          'system',
          'localstorage',
          fallbackStartTime,
          storedState.messages,
          'ChatState'
        )
        return storedState
      }

      // If no stored state, create new session
      const newSessionId = storage.startNewSession()
      return {
        messages: [],
        metadata: {
          sessionId: newSessionId,
          category: 'chat'
        }
      }
    } catch (error) {
      // Handle error silently
      recoveryAnalytics.trackRecoveryFailure(
        'system',
        'indexeddb',
        error as Error,
        'ChatState'
      )
      
      // Return clean slate if recovery fails
      const sessionId = storage.startNewSession()
      return {
        messages: [],
        metadata: {
          sessionId,
          category: 'chat'
        }
      }
    }
  }

  /**
   * Attempt to recover session data
   */
  static async recoverSessionData(sessionId: string): Promise<Message[]> {
    let attempts = 0
    
    while (attempts < this.MAX_RETRIES) {
      try {
        const startTime = await recoveryAnalytics.trackRecoveryAttempt(
          sessionId,
          'indexeddb',
          'SessionData'
        )

        // Try IndexedDB first
        const sessionData = await sessionManager.retrieveSession(sessionId)
        if (sessionData?.messages?.length > 0) {
          recoveryAnalytics.trackRecoverySuccess(
            sessionId,
            'indexeddb',
            startTime,
            sessionData.messages,
            'SessionData'
          )
          return sessionData.messages
        }
        
        // Fallback to storage
        const fallbackStartTime = await recoveryAnalytics.trackRecoveryAttempt(
          sessionId,
          'localstorage',
          'SessionData'
        )

        const messages = await storage.getSessionMessages(sessionId)
        if (messages.length > 0) {
          // Store recovered messages in IndexedDB for future
          await sessionManager.persistSession(
            sessionId,
            messages,
            {
              sessionId,
              category: 'chat',
              lastAccessed: new Date().toISOString(),
              lastModified: new Date().toISOString(),
              messageCount: messages.length,
              syncStatus: 'synced'
            }
          )

          recoveryAnalytics.trackRecoverySuccess(
            sessionId,
            'localstorage',
            fallbackStartTime,
            messages,
            'SessionData'
          )
          return messages
        }

        // Try backup recovery as last resort
        const backupStartTime = await recoveryAnalytics.trackRecoveryAttempt(
          sessionId,
          'backup',
          'SessionData'
        )
        const backupMessages = await this.recoverFromBackup(sessionId)
        
        if (backupMessages.length > 0) {
          recoveryAnalytics.trackRecoverySuccess(
            sessionId,
            'backup',
            backupStartTime,
            backupMessages,
            'SessionData'
          )
          return backupMessages
        }

        attempts++
        if (attempts === this.MAX_RETRIES) {
          throw new Error('Failed to recover session data after all attempts')
        }
        await this.delay(this.RETRY_DELAY * attempts) // Exponential backoff
      } catch (error) {
        // Handle error silently
        recoveryAnalytics.trackRecoveryFailure(
          sessionId,
          'indexeddb',
          error as Error,
          'SessionData'
        )
      }
    }
    
    return []
  }

  /**
   * Recover from message send failure
   */
  static async recoverFromMessageFailure(
    message: Message,
    error: Error
  ): Promise<{ success: boolean; retryable: boolean }> {
    // Check if error is retryable
    if (this.isRetryableError(error)) {
      return { success: false, retryable: true }
    }

    try {
      if (!message.metadata?.sessionId) {
        throw new Error('No session ID in message metadata')
      }

      // Save failed message to IndexedDB
      await sessionManager.persistSession(
        message.metadata.sessionId,
        [message],
        {
          sessionId: message.metadata.sessionId,
          category: message.metadata.category || 'chat',
          lastAccessed: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          messageCount: 1,
          syncStatus: 'pending'
        }
      )
      return { success: true, retryable: false }
    } catch (saveError) {
      // Handle error silently
      // Fallback to localStorage
      await this.saveFailedMessageToLocalStorage(message)
      return { success: false, retryable: false }
    }
  }

  /**
   * Attempt to recover any unsaved changes
   */
  static async recoverUnsavedChanges(sessionId: string): Promise<Message[]> {
    try {
      // Check IndexedDB first
      const sessionData = await sessionManager.retrieveSession(sessionId)
      if (sessionData?.messages?.length > 0) {
        const pendingMessages = sessionData.messages.filter(msg => 
          msg.metadata?.syncStatus === 'pending'
        )
        if (pendingMessages.length > 0) {
          return pendingMessages
        }
      }

      // Fallback to localStorage pending changes
      const pendingChanges = await this.getPendingChanges(sessionId)
      if (pendingChanges.length > 0) {
        await this.applyPendingChanges(sessionId, pendingChanges)
        return pendingChanges
      }
      
      return []
    } catch (error) {
      // Handle error silently
      return []
    }
  }

  private static isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'NetworkError',
      'TimeoutError',
      'ConnectionError',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'QuotaExceededError'
    ]
    
    return retryableErrors.some(errType => 
      error.name.includes(errType) || 
      error.message.includes(errType)
    )
  }

  private static async saveFailedMessageToLocalStorage(message: Message): Promise<void> {
    if (!message.metadata?.sessionId) return;

    const key = `failed_message_${message.metadata.sessionId}_${Date.now()}`
    try {
      localStorage.setItem(key, JSON.stringify(message))
    } catch (error) {
      // If localStorage fails, attempt cleanup and retry
      await this.cleanupOldMessages()
      localStorage.setItem(key, JSON.stringify(message))
    }
  }

  private static async recoverFromBackup(sessionId: string): Promise<Message[]> {
    try {
      // Attempt to recover from IndexedDB backup
      const sessionData = await sessionManager.retrieveSession(sessionId)
      if (sessionData?.messages?.length > 0) {
        return sessionData.messages
      }
      return []
    } catch (error) {
      // Handle error silently
      return []
    }
  }

  private static async getPendingChanges(sessionId: string): Promise<Message[]> {
    const pendingChanges: Message[] = []
    
    // Look for any pending changes in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(`failed_message_${sessionId}`)) {
        try {
          const message = JSON.parse(localStorage.getItem(key) || '')
          pendingChanges.push(message)
          localStorage.removeItem(key)
        } catch (error) {
          // Handle error silently
        }
      }
    }
    
    return pendingChanges
  }

  private static async applyPendingChanges(
    sessionId: string,
    changes: Message[]
  ): Promise<void> {
    try {
      // Get current messages from IndexedDB
      const sessionData = await sessionManager.retrieveSession(sessionId)
      const currentMessages = sessionData?.messages || []
      const updatedMessages = [...currentMessages, ...changes]

      // Persist to IndexedDB
      await sessionManager.persistSession(
        sessionId,
        updatedMessages,
        {
          sessionId,
          category: sessionData?.metadata?.category || 'chat',
          lastAccessed: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          messageCount: updatedMessages.length,
          syncStatus: 'synced'
        }
      )
    } catch (error) {
      // Handle error silently
      throw error
    }
  }

  private static async cleanupOldMessages(): Promise<void> {
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
    const now = Date.now()

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('failed_message_')) {
        try {
          const timestamp = parseInt(key.split('_').pop() || '0')
          if (now - timestamp > maxAge) {
            localStorage.removeItem(key)
          }
        } catch (error) {
          // Skip problematic key
        }
      }
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Hook for using recovery strategies
export function useRecovery() {
  const recoverState = async () => {
    return await RecoveryStrategy.recoverChatState()
  }

  const recoverSession = async (sessionId: string) => {
    return await RecoveryStrategy.recoverSessionData(sessionId)
  }

  const handleMessageFailure = async (message: Message, error: Error) => {
    return await RecoveryStrategy.recoverFromMessageFailure(message, error)
  }

  const recoverUnsaved = async (sessionId: string) => {
    return await RecoveryStrategy.recoverUnsavedChanges(sessionId)
  }

  return {
    recoverState,
    recoverSession,
    handleMessageFailure,
    recoverUnsaved
  }
}