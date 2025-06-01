import { useState, useEffect } from 'react'
import { X, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ThinkingExplainerProps {
  onDismiss: () => void
}

export function ThinkingExplainer({ onDismiss }: ThinkingExplainerProps) {
  const [isVisible, setIsVisible] = useState(true)
  
  // Check if this is the first time we're showing the explainer
  useEffect(() => {
    const hasSeenExplainer = localStorage.getItem('hasSeenThinkingExplainer') === 'true'
    setIsVisible(!hasSeenExplainer)
  }, [])
  
  const handleDismiss = () => {
    // Mark as seen in local storage
    localStorage.setItem('hasSeenThinkingExplainer', 'true')
    setIsVisible(false)
    onDismiss()
  }
  
  if (!isVisible) return null
  
  return (
    <div className={cn(
      "my-3 p-4 rounded-md bg-indigo-50 border border-indigo-200",
      "text-sm text-indigo-700",
      "animation-fade-in"
    )}>
      <div className="flex items-start">
        <HelpCircle className="h-5 w-5 text-indigo-500 mt-0.5 mr-2 shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold mb-1">About Extended Thinking</h3>
          <p className="mb-2">
            You're seeing CODAI's step-by-step thought process, a feature of Claude's "extended thinking" capability.
          </p>
          <p className="mb-2">
            This helps CODAI break down complex problems and reason more thoroughly before answering,
            which is especially helpful for tasks like coding, math, analysis, and planning.
          </p>
          <p className="mb-2">
            The system automatically detects complex tasks and adjusts CODAI's thinking depth to provide better responses.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm transition-colors"
            >
              Got it
            </button>
            <button
              onClick={() => window.open('https://codai.ai/docs/extended-thinking', '_blank')}
              className="px-3 py-1.5 rounded bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 text-sm transition-colors"
            >
              Learn more
            </button>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="p-1 hover:bg-indigo-100 rounded ml-2"
        >
          <X className="h-4 w-4 text-indigo-500" />
        </button>
      </div>
    </div>
  )
}