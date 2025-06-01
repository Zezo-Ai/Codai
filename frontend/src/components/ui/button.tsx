import * as React from "react"
import { cn } from "@/lib/utils"

// Define variant and size maps
const variants = {
  default: "bg-blue-600 text-white shadow hover:bg-blue-700",
  destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  outline: "border border-gray-300 bg-white shadow-sm hover:bg-gray-100",
  secondary: "bg-gray-200 text-gray-800 shadow-sm hover:bg-gray-300",
  ghost: "hover:bg-gray-100",
  link: "text-blue-600 underline-offset-4 hover:underline",
}

const sizes = {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-8",
  icon: "h-9 w-9",
}

// Convert buttonVariants to a function that returns classes as expected by alert-dialog.tsx
const buttonVariants = ({ 
  variant = "default", 
  size = "default", 
  className = "" 
}: { 
  variant?: keyof typeof variants; 
  size?: keyof typeof sizes;
  className?: string;
} = {}) => {
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    className
  )
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }