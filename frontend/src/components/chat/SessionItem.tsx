'use client'

import { memo, useRef } from 'react'
import { MessageSquare, ChevronRight, Loader2 } from 'lucide-react'
import type { StoredSession } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { TitleManager } from './titleManager'

interface SessionItemProps {
  session: StoredSession
  isActive: boolean
  isLoading: boolean
  onSelect: (sessionId: string) => void
  actionInProgress: string | null
}

function SessionItemComponent({
  session,
  isActive,
  isLoading,
  onSelect,
  actionInProgress
}: SessionItemProps) {
  const isActionsDisabled = isLoading || actionInProgress !== null
  const isChanging = actionInProgress === session.id
  const titleManager = useRef(TitleManager.getInstance()).current

  // Get title from title manager or fallback to session title
  const sessionTitle = titleManager.restoreTitle(session.id) || session.title || 'New Chat'

  return (
    <button
      onClick={() => onSelect(session.id)}
      disabled={isActionsDisabled}
      className={cn(
        "flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 w-full",
        "relative",
        isActive
          ? 'bg-gradient-to-r from-indigo-50 to-white text-indigo-600 shadow-sm' 
          : 'hover:bg-gray-50 text-gray-600',
        isActionsDisabled && "cursor-not-allowed"
      )}
    >
      <MessageSquare className="h-4 w-4" />
      <span className="text-sm truncate">{sessionTitle}</span>
      {isActive && <ChevronRight className="h-4 w-4 ml-auto flex-shrink-0" />}
      
      {isChanging && (
        <div className="absolute inset-0 flex items-center justify-end pr-2 bg-white/50 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
        </div>
      )}
    </button>
  )
}

export const SessionItem = memo(SessionItemComponent)