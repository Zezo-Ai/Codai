import { useState, useEffect } from 'react'
import { Brain, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { featureFlags } from '@/lib/featureFlags'

export function ExtendedThinkingSettings() {
  const [isEnabled, setIsEnabled] = useState(false)
  
  // Load preference on mount
  useEffect(() => {
    const status = featureFlags.getFeatureStatus('extendedThinking')
    setIsEnabled(status.isAvailable)
  }, [])
  
  // Save preference when changed
  const handleToggle = () => {
    const newState = featureFlags.toggleExtendedThinking()
    setIsEnabled(newState)
  }
  
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Extended Thinking</h3>
        <p className="text-sm text-gray-500">
          Show CODAI's step-by-step reasoning for complex questions
        </p>
      </div>
      
      <div className="flex items-center justify-between p-3 rounded-lg bg-indigo-50/50 border border-indigo-100">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <Brain className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="font-medium">Show thinking process</h4>
            <p className="text-sm text-gray-600">See CODAI's reasoning steps</p>
          </div>
        </div>
        
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={isEnabled}
            onChange={handleToggle}
          />
          <div className={cn(
            "w-11 h-6 rounded-full peer",
            "after:content-[''] after:absolute after:top-[2px] after:left-[2px]",
            "after:bg-white after:rounded-full after:h-5 after:w-5",
            "after:transition-all peer-checked:after:translate-x-full",
            "bg-gray-300 peer-checked:bg-indigo-600"
          )}></div>
        </label>
      </div>
      
      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
        <div className="flex">
          <Info className="h-5 w-5 text-gray-500 mr-2 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-600">
            <p className="mb-2">
              Extended thinking is automatically activated for complex questions requiring 
              detailed analysis or reasoning.
            </p>
            <p>
              When enabled, you'll see CODAI's step-by-step thought process before the final answer.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}