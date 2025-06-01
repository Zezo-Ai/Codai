'use client'

import { forwardRef, useEffect, memo } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { ChatMessage } from './ChatMessage'
import { cn } from '@/lib/utils'
import type { Message } from './types'

// Memoized version of ChatMessage to prevent unnecessary re-renders
const MemoizedChatMessage = memo(({ 
  message, 
  onRetry, 
  onCopy, 
  isLoading,
  thinkingState,
  thinkingContent,
  thinkingSignature,
  thinkingStatus,
  thinkingTimestamp,
  thinkingSessionId
}: { 
  message: Message, 
  onRetry?: () => void, 
  onCopy?: (content: string) => void, 
  isLoading: boolean,
  thinkingState?: string,
  thinkingContent?: string,
  thinkingSignature?: string,
  thinkingStatus?: string,
  thinkingTimestamp?: number,
  thinkingSessionId?: string
}) => {
  return (
    <ChatMessage
      key={`${message.timestamp}-${message.role}`}
      role={message.role}
      segments={message.segments}
      timestamp={message.timestamp}
      isThinking={message.isThinking}
      onRetry={onRetry}
      onCopy={onCopy}
      isLoading={isLoading}
      thinkingState={thinkingState as any}
      thinkingContent={thinkingContent}
      thinkingSignature={thinkingSignature}
      thinkingStatus={thinkingStatus}
      thinkingTimestamp={thinkingTimestamp || message.timestamp}
      thinkingSessionId={thinkingSessionId || message.metadata?.sessionId}
      stateHtml={(message as any).stateHtml} // Pass stateHtml to ChatMessage
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to determine if re-render is needed
  const prevMessage = prevProps.message;
  const nextMessage = nextProps.message;
  
  // Re-render if loading state changes
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  
  // Re-render if thinking state changes
  if (prevMessage.isThinking !== nextMessage.isThinking) return false;
  
  // Re-render if thinking props change
  if (prevProps.thinkingState !== nextProps.thinkingState) return false;
  if (prevProps.thinkingContent !== nextProps.thinkingContent) return false;
  
  // Re-render if stateHtml changes
  if ((prevMessage as any).stateHtml !== (nextMessage as any).stateHtml) return false;
  
  // Re-render if segments length changes
  if (prevMessage.segments.length !== nextMessage.segments.length) return false;
  
  // By default, don't re-render
  return true;
});

interface ChatMessagesProps {
  messages: Message[]
  onSuggestionClick: (suggestion: string) => void
  isLoading?: boolean
  onRetry?: () => void
  onCopy?: (content: string) => void
  thinkingState?: string
  thinkingContent?: string
  thinkingSignature?: string
  thinkingStatus?: string
}

const SUGGESTIONS = [
  "Take a screenshot and describe",
  "Check current folder",
  "Explain your capabilities",
  "Build a todo list app"
]

export const ChatMessages = forwardRef<HTMLDivElement, ChatMessagesProps>(
  function ChatMessages({ 
    messages, 
    onSuggestionClick, 
    isLoading = false, 
    onRetry, 
    onCopy,
    thinkingState,
    thinkingContent,
    thinkingSignature,
    thinkingStatus
  }, ref) {
    if (isLoading) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <div className="mb-4 relative">
            <img src="/icon.png" alt="Codai Logo" className="h-16 w-16 opacity-60" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Loading Messages...
          </h2>
          <p className="text-gray-600">
            Please wait while we retrieve your conversation
          </p>
        </div>
      )
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <div className="mb-4">
            <img src="/icon.png" alt="Codai Logo" className="h-16 w-16" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Welcome to CODAI
          </h2>
          <p className="text-gray-600 max-w-md mb-8">
            Turn ideas into production-ready apps and solutions. Zero code required. Just describe what you want to build.
          </p>
          <div className={cn(
            "grid grid-cols-2 gap-4 max-w-2xl w-full px-4",
            isLoading && "opacity-50 pointer-events-none"
          )}>
            {SUGGESTIONS.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => onSuggestionClick(suggestion)}
                disabled={isLoading}
                className={cn(
                  "p-4 text-left rounded-xl bg-white border border-gray-200",
                  "hover:border-indigo-200 hover:bg-indigo-50 text-gray-600",
                  "transition-colors duration-200 shadow-sm hover:shadow-md",
                  isLoading && "cursor-not-allowed opacity-75"
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        <div
          id="chat-messages-container"
          className={cn(
            "space-y-4",
            isLoading && "opacity-75 pointer-events-none"
          )}
        >
        {messages.map((message, index) => {
          // Determine if this is the last assistant message (for live thinking updates)
          const isLastAssistantMessage = index === messages.length - 1 && message.role === 'assistant';
          
          return (
            <MemoizedChatMessage
              key={`${message.timestamp}-${index}`}
              message={message}
              onRetry={onRetry}
              onCopy={onCopy}
              isLoading={isLoading}
              // Use current thinking state only for live thinking
              thinkingState={isLastAssistantMessage ? thinkingState : undefined}
              thinkingContent={isLastAssistantMessage ? thinkingContent : undefined}
              thinkingSignature={isLastAssistantMessage ? thinkingSignature : undefined}
              thinkingStatus={isLastAssistantMessage ? thinkingStatus : undefined}
              // Pass message timestamp for storage lookup
              thinkingTimestamp={message.timestamp}
              thinkingSessionId={thinkingState !== undefined ? messages[0]?.metadata?.sessionId : undefined}
            />
          );
        })}
        <div ref={ref} />
        </div>
      </div>
    )
  }
)