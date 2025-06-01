'use client'

import { Computer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useComputerUse } from '../hooks/useComputerUse'

interface ComputerUseToggleProps {
  className?: string
  disabled?: boolean
}

export function ComputerUseToggle({ 
  className = '',
  disabled = false 
}: ComputerUseToggleProps) {
  const { isEnabled, toggle } = useComputerUse()

  return (
    <div className="relative inline-block">
      {/* Main Button */}
      <div className="group">
        <button
          onClick={toggle}
          disabled={disabled}
          className={cn(
            "p-2 rounded-lg transition-colors relative",
            isEnabled ? [
              "text-indigo-600 hover:bg-indigo-50",
              "active:bg-indigo-100"
            ] : [
              "text-gray-600 hover:bg-gray-50",
              "active:bg-gray-100"
            ],
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
          aria-label={`Computer use is ${isEnabled ? 'enabled' : 'disabled'}`}
        >
          <Computer className="h-5 w-5" />
        </button>

        {/* Tooltip */}
        <div
          role="tooltip"
          className={cn(
            "absolute z-[100]",
            "left-1/2 -translate-x-1/2 bottom-[calc(100%+10px)]",
            "bg-white",
            "px-3 py-2",
            "rounded-md",
            "shadow-lg",
            "opacity-0 invisible",
            "group-hover:opacity-100 group-hover:visible",
            "transition-all duration-200",
            "border border-gray-200"
          )}
        >
          <div className="text-sm font-medium text-gray-900">
            Computer Access: <span className={cn(
              isEnabled ? "text-green-600" : "text-red-600"
            )}>
              {isEnabled ? 'On' : 'Off'}
            </span>
          </div>

          {/* Arrow */}
          <span 
            className={cn(
              "absolute -bottom-2 left-1/2 -translate-x-1/2",
              "border-[8px] border-transparent",
              "border-t-white",
              "shadow-sm"
            )}
          />
        </div>
      </div>
    </div>
  )
}