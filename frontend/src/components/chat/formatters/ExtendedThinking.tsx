import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Brain, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import type { ThinkingMetadata } from '../types'
import { ThinkingExplainer } from './ThinkingExplainer'

export interface ThinkingBlockProps {
  thinking: string
  signature?: string
  metadata?: ThinkingMetadata
  isLoading?: boolean
}

export interface RedactedThinkingProps {
  data?: string
  message?: string
  isLoading?: boolean
}

export interface ThinkingIndicatorProps {
  message?: string
  isLoading?: boolean
}

export function ThinkingBlock({ 
  thinking,
  signature, 
  metadata,
  isLoading = false
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showExplainer, setShowExplainer] = useState(false)
  const toggleExpanded = useCallback(() => setIsExpanded(prev => !prev), [])

  // Track user preference for expanded thinking blocks
  useEffect(() => {
    const savedPreference = localStorage.getItem('extendedThinkingExpanded')
    if (savedPreference !== null) {
      setIsExpanded(savedPreference === 'true')
    }
    
    // Check if we should show the explainer
    const hasSeenExplainer = localStorage.getItem('hasSeenThinkingExplainer') === 'true'
    const explainerEnabled = localStorage.getItem('enableThinkingExplainer') !== 'false'
    setShowExplainer(!hasSeenExplainer && explainerEnabled)
  }, [])

  // Save preference when changed
  useEffect(() => {
    localStorage.setItem('extendedThinkingExpanded', String(isExpanded))
  }, [isExpanded])

  return (
    <>
      {showExplainer && (
        <ThinkingExplainer onDismiss={() => setShowExplainer(false)} />
      )}
      <div className={cn(
        "my-3 rounded-md overflow-hidden bg-indigo-50/50 border border-indigo-100",
        "transition-all duration-300 ease-in-out",
        isLoading && "opacity-70",
      )}>
        <div 
          onClick={toggleExpanded}
          className={cn(
            "flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-100/50",
            "transition-colors duration-200",
            "border-b border-indigo-100",
            !isExpanded && "border-transparent"
          )}
        >
        <Brain className="h-4 w-4 text-indigo-500 mr-2" />
        <div className="text-sm font-medium text-indigo-700 flex-1">
          <span>CODAI's thought process</span>
          {metadata?.complexity && (
            <span className={cn(
              "ml-2 px-1.5 py-0.5 text-xs rounded-full",
              metadata.complexity === 'simple' && "bg-blue-100 text-blue-700",
              metadata.complexity === 'standard' && "bg-indigo-100 text-indigo-700",
              metadata.complexity === 'complex' && "bg-purple-100 text-purple-700",
              metadata.complexity === 'very_complex' && "bg-violet-100 text-violet-700"
            )}>
              {metadata.complexity.replace('_', ' ')}
            </span>
          )}
        </div>
        <div className="text-xs text-indigo-500 mr-2">
          {thinking?.length ? `${Math.round(thinking.length / 4)} tokens` : ''}
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation()
            toggleExpanded()
          }}
          className="p-1 hover:bg-indigo-200/50 rounded"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-indigo-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-indigo-500" />
          )}
        </button>
      </div>
      <div className={cn(
        "transition-[max-height,padding] duration-300 ease-in-out overflow-y-auto",
        "whitespace-pre-wrap text-sm font-mono bg-white",
        isExpanded ? "max-h-[500px] p-3" : "max-h-0 p-0"
      )}>
        {thinking}
      </div>
    </div>
    </>
  )
}

export function RedactedThinking({
  data,
  message,
  isLoading = false
}: RedactedThinkingProps) {
  return (
    <div className={cn(
      "my-3 p-3 rounded-md bg-amber-50/50 border border-amber-100",
      "text-sm flex items-center",
      isLoading && "opacity-70",
    )}>
      <Lock className="h-4 w-4 text-amber-500 mr-2 shrink-0" />
      <span className="text-amber-800">
        {message || "Some thinking content has been encrypted for safety purposes."}
      </span>
    </div>
  )
}

export function ThinkingIndicator({
  message,
  isLoading = false
}: ThinkingIndicatorProps) {
  return (
    <div className={cn(
      "my-3 flex items-center text-indigo-700 font-medium",
      isLoading && "opacity-70",
    )}>
      <div className="flex items-center mr-2">
        <Brain className="h-4 w-4 mr-1 animate-pulse" />
        <span>{message || "CODAI is thinking deeply..."}</span>
      </div>
      <div className="flex items-center space-x-1">
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" 
          style={{ animationDelay: '0ms' }} />
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" 
          style={{ animationDelay: '200ms' }} />
        <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" 
          style={{ animationDelay: '400ms' }} />
      </div>
    </div>
  )
}