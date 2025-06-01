'use client'

import React, { useState, useEffect } from 'react'
import { Brain, Zap, Lightbulb } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AiMode, AI_MODELS, DEFAULT_MODE } from '@/config/aiModels'

interface AiModeOption {
  id: AiMode
  label: string
  description: string
  model: string
  icon: JSX.Element
  color: string
  bgColor: string
  disabled?: boolean
}

const aiModes: AiModeOption[] = [
  {
    id: AI_MODELS.OPUS.id,
    label: AI_MODELS.OPUS.label,
    description: `${AI_MODELS.OPUS.name} - ${AI_MODELS.OPUS.description}`,
    model: AI_MODELS.OPUS.model,
    icon: <Brain className="h-4 w-4 text-purple-600" />,
    color: AI_MODELS.OPUS.color,
    bgColor: AI_MODELS.OPUS.bgColor,
  },
  {
    id: AI_MODELS.SONNET.id,
    label: AI_MODELS.SONNET.label,
    description: `${AI_MODELS.SONNET.name} - ${AI_MODELS.SONNET.description}`,
    model: AI_MODELS.SONNET.model,
    icon: <Zap className="h-4 w-4 text-blue-600" />,
    color: AI_MODELS.SONNET.color,
    bgColor: AI_MODELS.SONNET.bgColor,
  },
  {
    id: AI_MODELS.HAIKU.id,
    label: AI_MODELS.HAIKU.label,
    description: `${AI_MODELS.HAIKU.name} - ${AI_MODELS.HAIKU.description}`,
    model: AI_MODELS.HAIKU.model,
    icon: <Lightbulb className="h-4 w-4 text-green-600" />,
    color: AI_MODELS.HAIKU.color,
    bgColor: AI_MODELS.HAIKU.bgColor,
    disabled: false,
  },
]

interface AiModeSwitcherProps {
  currentMode?: AiMode
  onModeChange?: (mode: AiMode) => void
  className?: string
  compact?: boolean
}

export function AiModeSwitcher({ 
  currentMode = DEFAULT_MODE, 
  onModeChange,
  className,
  compact = false 
}: AiModeSwitcherProps) {
  const [selectedMode, setSelectedMode] = useState<AiMode>(currentMode)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setSelectedMode(currentMode)
  }, [currentMode])

  const handleModeChange = (modeId: string) => {
    const mode = modeId as AiMode
    const modeOption = aiModes.find(m => m.id === mode)
    
    if (modeOption?.disabled) return
    
    setSelectedMode(mode)
    onModeChange?.(mode)
  }

  const currentModeOption = aiModes.find(mode => mode.id === selectedMode) || aiModes[1]

  if (!mounted) {
    return (
      <div className={cn("flex items-center space-x-2", className)}>
        <div className="w-20 h-8 bg-gray-100 rounded animate-pulse" />
      </div>
    )
  }

  if (compact) {
    return (
      <div className={cn("flex items-center", className)}>
        <Select value={selectedMode} onValueChange={handleModeChange}>
          <SelectTrigger className={cn(
            "w-auto min-w-[120px] h-8 text-xs border rounded-md px-2 py-1",
            "bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0",
            "border-gray-200 shadow-sm"
          )}>
            <div className="flex items-center space-x-1.5">
              <span className="flex-shrink-0">
                {currentModeOption.icon}
              </span>
              <span className="font-medium text-gray-700 text-xs">
                {currentModeOption.label}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="min-w-[200px]">
            {aiModes.map((mode) => (
              <SelectItem 
                key={mode.id} 
                value={mode.id}
                disabled={mode.disabled}
                className={cn(
                  "cursor-pointer py-2",
                  mode.disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-2">
                    <span className="flex-shrink-0">
                      {mode.icon}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{mode.label}</span>
                      <span className="text-xs text-gray-500">{mode.description}</span>
                    </div>
                  </div>
                  {mode.disabled && (
                    <span className="text-xs text-orange-500 font-medium ml-2">
                      Coming Soon
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center space-x-3", className)}>
      <span className="text-sm font-medium text-gray-700">AI Mode:</span>
      <Select value={selectedMode} onValueChange={handleModeChange}>
        <SelectTrigger className={cn(
          "w-48 border focus:ring-2 focus:ring-offset-1",
          currentModeOption.bgColor,
          "focus:ring-blue-500"
        )}>
          <div className="flex items-center space-x-2">
            <span className={currentModeOption.color}>{currentModeOption.icon}</span>
            <SelectValue placeholder="Select AI mode" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {aiModes.map((mode) => (
            <SelectItem 
              key={mode.id} 
              value={mode.id}
              disabled={mode.disabled}
              className={cn(
                "flex items-center justify-between py-3",
                mode.disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center space-x-3">
                <span className={mode.color}>{mode.icon}</span>
                <div className="flex flex-col">
                  <span className="font-medium">{mode.label}</span>
                  <span className="text-xs text-gray-500">{mode.description}</span>
                </div>
              </div>
              {mode.disabled && (
                <span className="text-xs text-orange-500 font-medium">Coming Soon</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// Export the types for use in other components
export { type AiModeOption }