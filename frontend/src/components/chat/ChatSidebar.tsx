'use client'

import { useEffect, useReducer, useCallback, useRef } from 'react'
import { Terminal, Loader2 } from 'lucide-react'
import type { StoredSession } from '@/lib/storage'
import { storage } from '@/lib/storage'
import { SessionSwitcher } from './SessionSwitcher'
import { SessionItem } from './SessionItem'
import { SidebarFooter } from '../sidebar/SidebarFooter'
import { SidebarErrorBoundary } from './SidebarErrorBoundary'
import { chatSidebarReducer, type ActionState } from './chatSidebarReducer'
import { cn } from '@/lib/utils'

interface ChatSidebarProps {
  sessions: StoredSession[]
  currentSessionId: string
  onSessionSelect: (sessionId: string) => Promise<void>
  onDeleteSession: (sessionId: string) => Promise<void>
  onNewSession: () => Promise<void>
  isLoading?: boolean
}

const RETRY_LIMIT = 3
const ACTION_TIMEOUT = 10000 // 10 seconds

export function ChatSidebar({
  sessions,
  currentSessionId,
  onSessionSelect,
  onDeleteSession,
  onNewSession,
  isLoading = false
}: ChatSidebarProps) {
  // Initialize reducer with initial state
  const [state, dispatch] = useReducer(chatSidebarReducer, {
    actionInProgress: null,
    activeSessionId: currentSessionId,
    error: null,
    retryCount: 0
  } as ActionState)

  // Timeout ref for cleanup
  const timeoutRef = useRef<NodeJS.Timeout>()

  // Sync with parent state on mount and currentSessionId change
  useEffect(() => {
    dispatch({ type: 'SET_ACTIVE_SESSION', payload: currentSessionId })
  }, [currentSessionId])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Action handler with timeout, retries and error handling
  const handleAsyncAction = useCallback(async (
    action: () => Promise<void>,
    actionId: string = 'generic'
  ) => {
    const isActionsDisabled = isLoading || state.actionInProgress !== null
    if (isActionsDisabled) return

    dispatch({ type: 'START_ACTION', payload: actionId })

    // Set timeout
    timeoutRef.current = setTimeout(() => {
      dispatch({ 
        type: 'SET_ERROR', 
        payload: new Error('Operation timed out') 
      })
    }, ACTION_TIMEOUT)

    try {
      await action()
      dispatch({ type: 'END_ACTION' })
    } catch (error) {
      if (state.retryCount < RETRY_LIMIT) {
        dispatch({ type: 'INCREMENT_RETRY' })
        // Retry with exponential backoff
        setTimeout(() => {
          handleAsyncAction(action, actionId)
        }, Math.pow(2, state.retryCount) * 1000)
      } else {
        dispatch({ 
          type: 'SET_ERROR', 
          payload: error as Error 
        })
      }
    } finally {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [isLoading, state.actionInProgress, state.retryCount])

  const handleSessionSelect = useCallback((sessionId: string) => {
    if (sessionId === state.activeSessionId || isLoading || state.actionInProgress) return

    dispatch({ type: 'SET_ACTIVE_SESSION', payload: sessionId })
    handleAsyncAction(
      () => onSessionSelect(sessionId),
      sessionId
    )
  }, [state.activeSessionId, isLoading, state.actionInProgress, handleAsyncAction, onSessionSelect])

  const handleNewSession = useCallback(() => {
    handleAsyncAction(onNewSession, 'new')
  }, [handleAsyncAction, onNewSession])

  const handleDeleteSession = useCallback((sessionId: string) => {
    handleAsyncAction(
      () => onDeleteSession(sessionId),
      sessionId
    )
  }, [handleAsyncAction, onDeleteSession])

  const handleErrorReset = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' })
    dispatch({ type: 'RESET_RETRY' })
  }, [])

  return (
    <SidebarErrorBoundary onReset={handleErrorReset}>
      <div className="w-64 border-r border-gray-200 bg-white flex flex-col">
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center space-x-3 px-2 mb-6">
            <div className="flex-shrink-0">
              <img src="/icon.png" alt="Codai Logo" className="h-7 w-7" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">CODAI</h1>
              <p className="text-xs text-gray-500">v0.1.0 Alpha</p>
            </div>
          </div>

          {/* Session Switcher */}
          <div className={cn(
            "relative",
            (isLoading || state.actionInProgress) && "opacity-50 pointer-events-none"
          )}>
            <SessionSwitcher
              sessions={sessions}
              currentSessionId={state.activeSessionId}
              onSessionSelect={handleSessionSelect}
              onDeleteSession={handleDeleteSession}
              onNewSession={handleNewSession}
              disabled={isLoading || state.actionInProgress !== null}
            />

            {(isLoading || state.actionInProgress) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-lg">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              </div>
            )}
          </div>



          {/* Session List */}
          <div className={cn(
            "mt-6 space-y-1",
            (isLoading || state.actionInProgress) && "opacity-50 pointer-events-none"
          )}>
            {(() => {
              // Apply consistent sorting for display
              const { sortSessionsByLastUpdated } = require('@/utils/sessionUtils');
              const sortedSessions = sortSessionsByLastUpdated(sessions);
              
              return sortedSessions.map(session => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === state.activeSessionId}
                  isLoading={isLoading}
                  onSelect={handleSessionSelect}
                  actionInProgress={state.actionInProgress}
                />
              ));
            })()}
          </div>

          {/* Error Display */}
          {state.error && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              <p className="font-medium">Error: {state.error.message}</p>
              <button
                onClick={handleErrorReset}
                className="mt-2 text-red-700 hover:text-red-800 font-medium"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Retry Indicator */}
          {state.retryCount > 0 && (
            <div className="mt-2 text-xs text-gray-500 text-center">
              Retrying... Attempt {state.retryCount} of {RETRY_LIMIT}
            </div>
          )}
        </div>

        <SidebarFooter 
          version="v0.1.0 Alpha"
          edition="Evolved Intelligence Edition"
        />
      </div>
    </SidebarErrorBoundary>
  )
}