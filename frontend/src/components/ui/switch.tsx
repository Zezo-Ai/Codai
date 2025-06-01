"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Simple Switch component that doesn't rely on external dependencies
interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, className, ...props }, ref) => {
    // Handle state internally if not controlled
    const [isChecked, setIsChecked] = React.useState(checked ?? false)
    
    // Update internal state when controlled prop changes
    React.useEffect(() => {
      if (checked !== undefined) {
        setIsChecked(checked)
      }
    }, [checked])
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked
      if (onCheckedChange) {
        onCheckedChange(newChecked)
      } else {
        setIsChecked(newChecked)
      }
    }
    
    return (
      <div className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        isChecked ? "bg-blue-600" : "bg-gray-200",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className
      )}>
        <input
          type="checkbox"
          className="sr-only"
          checked={isChecked}
          onChange={handleChange}
          disabled={disabled}
          ref={ref}
          {...props}
        />
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
            isChecked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </div>
    )
  }
)