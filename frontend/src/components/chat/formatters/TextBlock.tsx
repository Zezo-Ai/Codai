'use client'

import type { TextBlockProps } from '../types'
import { TextFormatter } from './TextFormatter'

export function TextBlock({ 
  content, 
  isLoading = false,
  metadata 
}: TextBlockProps) {
  const formattingOptions = {
    enableMarkdown: metadata?.enableMarkdown ?? true,
    enableLists: metadata?.enableLists ?? true,
    enableCodeBlocks: metadata?.enableCodeBlocks ?? true,
    className: "text-sm"
  }

  return (
    <div className="relative">
      <TextFormatter 
        content={content}
        options={formattingOptions}
      />
    </div>
  )
}