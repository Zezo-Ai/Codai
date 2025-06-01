'use client'

import { FC, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, CheckCircle2 } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { format } from 'date-fns'

interface LogEntryProps {
  entry: {
    timestamp: string
    level: string
    message: string
    [key: string]: any
  }
}

export const LogEntryViewer: FC<LogEntryProps> = ({ entry }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Determine the severity color
  const getSeverityColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'debug':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200'
    }
  }

  // Format extra data for display
  const formatExtraData = (data: any) => {
    if (!data) return null
    const formatted: any = {}
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        formatted[key] = value
      }
    })
    return Object.keys(formatted).length > 0 ? formatted : null
  }

  const extraData = formatExtraData(entry)
  const hasExtra = !!extraData

  return (
    <div className="border rounded-lg mb-2 overflow-hidden">
      {/* Header */}
      <div 
        className={`p-3 flex items-start justify-between cursor-pointer ${getSeverityColor(entry.level)} border-b`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="font-mono text-sm">
            {format(new Date(entry.timestamp), 'yyyy-MM-dd HH:mm:ss.SSS')}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase`}>
            {entry.level || 'INFO'}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            copyToClipboard(JSON.stringify(entry, null, 2))
          }}
          className="p-1 hover:bg-black/5 rounded"
          title="Copy log entry"
        >
          {copied ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Message */}
      <div className="p-3 bg-white/50 border-b">
        <div className="font-mono text-sm whitespace-pre-wrap">{entry.message}</div>
      </div>

      {/* Extra Data */}
      {isExpanded && hasExtra && (
        <div className="p-3 bg-gray-50">
          <div className="space-y-2">
            {Object.entries(extraData).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[120px,1fr] gap-4">
                <div className="text-sm font-medium text-gray-500">{key}:</div>
                <div className="text-sm font-mono">
                  {typeof value === 'object' ? (
                    <SyntaxHighlighter 
                      language="json" 
                      style={vs}
                      customStyle={{
                        margin: 0,
                        padding: '0.5rem',
                        background: 'transparent'
                      }}
                    >
                      {JSON.stringify(value, null, 2)}
                    </SyntaxHighlighter>
                  ) : (
                    String(value)
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}