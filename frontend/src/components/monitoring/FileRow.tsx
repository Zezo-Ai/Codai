'use client'

import { FC } from 'react'
import { FileText, Clock } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  filename: string
  size: number
  modified: string
  hasContent: boolean
  onClick: () => void
}

export const FileRow: FC<Props> = ({ filename, size, modified, hasContent, onClick }) => {
  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(2)} KB`
    const mb = kb / 1024
    return `${mb.toFixed(2)} MB`
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-2 hover:bg-muted/50 cursor-pointer rounded group
        ${hasContent ? 'bg-blue-50/50' : ''}`}
    >
      <div className="flex items-center min-w-0">
        <FileText className={`w-4 h-4 mr-2 ${hasContent ? 'text-blue-500' : 'text-gray-400'}`} />
        <span className={`font-medium truncate ${hasContent ? 'text-blue-900' : ''}`}>
          {filename}
        </span>
        <span className={`ml-2 text-sm ${hasContent ? 'text-blue-600' : 'text-muted-foreground'}`}>
          ({formatFileSize(size)})
        </span>
      </div>
      
      <div className="flex items-center text-muted-foreground">
        <Clock className="w-4 h-4 ml-4 mr-1" />
        <span className="text-sm whitespace-nowrap">
          {format(new Date(modified), 'PPp')}
        </span>
      </div>
    </div>
  )
}