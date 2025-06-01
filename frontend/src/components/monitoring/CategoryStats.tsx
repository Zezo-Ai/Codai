'use client'

import { FC, useRef } from 'react'
import { Tooltip } from './Tooltip'

interface Props {
  category: string
  files: any[]
}

export const CategoryStats: FC<Props> = ({ category, files }) => {
  const tooltipTriggerRef = useRef<HTMLDivElement>(null)
  const nonEmptyCount = files.filter(f => f.entries.length > 0).length
  const emptyCount = files.length - nonEmptyCount
  const percentage = ((nonEmptyCount / files.length) * 100).toFixed(1)
  
  return (
    <div 
      ref={tooltipTriggerRef}
      className="flex items-center gap-1.5"
      onMouseEnter={() => {
        const tooltip = document.getElementById(`tooltip-${category}`)
        if (tooltip) tooltip.style.display = 'block'
      }}
      onMouseLeave={() => {
        const tooltip = document.getElementById(`tooltip-${category}`)
        if (tooltip) tooltip.style.display = 'none'
      }}
    >
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-green-500"></div>
        <span className="text-sm text-green-600 font-medium">
          {nonEmptyCount}
        </span>
      </div>
      <span className="text-sm text-muted-foreground">/</span>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-gray-300"></div>
        <span className="text-sm text-gray-500">
          {files.length}
        </span>
      </div>
      <span className="text-sm text-muted-foreground ml-1">files</span>

      <Tooltip
        id={`tooltip-${category}`}
        triggerRef={tooltipTriggerRef}
        content={
          <div className="space-y-1">
            <p>
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>
              {nonEmptyCount} files with content
            </p>
            <p>
              <span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1"></span>
              {emptyCount} empty files
            </p>
            <div className="h-px bg-gray-700 my-1"></div>
            <p className="text-gray-300">
              {percentage}% have content
            </p>
          </div>
        }
      />
    </div>
  )
}