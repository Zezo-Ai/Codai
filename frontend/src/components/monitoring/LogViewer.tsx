'use client'

import { FC, useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, FileText, Clock, RefreshCw, Settings } from 'lucide-react'
import { LogManagement } from './LogManagement'
import { LogFileViewer } from './LogFileViewer'
import { CategoryStats } from './CategoryStats'
import { FileRow } from './FileRow'
import { format } from 'date-fns'

interface LogEntry {
  timestamp: string
  level: string
  message: string
  [key: string]: any
}

interface LogFile {
  filename: string
  path: string
  size: number
  modified: string
  entries: LogEntry[]
}

interface LogData {
  [category: string]: LogFile[]
}

export const LogViewer: FC = () => {
  const [logData, setLogData] = useState<LogData | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [refreshStates, setRefreshStates] = useState<Record<string, boolean>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showManagement, setShowManagement] = useState(false)

  const fetchLogs = useCallback(async () => {
    try {
      setIsRefreshing(true)
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
      const response = await fetch(`${baseUrl}/api/monitoring/logs`)
      if (!response.ok) {
        throw new Error('Failed to fetch logs')
      }
      const data = await response.json()
      setLogData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  const refreshLogFile = useCallback(async (category: string, filePath: string) => {
    try {
      setRefreshStates(prev => ({ ...prev, [filePath]: true }))
      await fetchLogs()
    } finally {
      setRefreshStates(prev => ({ ...prev, [filePath]: false }))
    }
  }, [fetchLogs])

  useEffect(() => {
    fetchLogs()
  }, [])

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const toggleFile = (path: string) => {
    const newExpanded = new Set(expandedFiles)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFiles(newExpanded)
  }

  const getLevelIcon = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      case 'info':
        return <Info className="w-4 h-4 text-blue-500" />
      default:
        return <Info className="w-4 h-4 text-gray-500" />
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading logs...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-red-500">Error: {error}</div>
          <button
            onClick={() => fetchLogs()}
            className="flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">System Logs</h2>
        <div className="flex gap-2">
          <button
            onClick={() => fetchLogs()}
            className={`flex items-center gap-2 px-3 py-2 rounded-md border 
              hover:bg-gray-50 transition-all
              ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Logs'}</span>
          </button>
          
          <button
            onClick={() => setShowManagement(!showManagement)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md border 
              hover:bg-gray-50 transition-all
              ${showManagement ? 'bg-blue-50 border-blue-200' : ''}`}
          >
            <Settings className="w-4 h-4" />
            <span>Manage Logs</span>
          </button>
        </div>
      </div>
      
      {/* Management Panel */}
      {showManagement && (
        <div className="mb-6 border rounded-lg p-4 bg-gray-50">
          <h3 className="text-lg font-medium mb-4">Log Management</h3>
          <LogManagement onSuccess={fetchLogs} />
        </div>
      )}
      
      {logData && Object.entries(logData).map(([category, files]) => (
        <div key={category} className="border rounded-lg overflow-hidden">
          <div
            className="flex items-center p-4 bg-card hover:bg-muted/50 cursor-pointer"
            onClick={() => toggleCategory(category)}
          >
            {expandedCategories.has(category) ? (
              <ChevronDown className="w-5 h-5 mr-2" />
            ) : (
              <ChevronRight className="w-5 h-5 mr-2" />
            )}
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold capitalize">{category}</h3>
              <CategoryStats category={category} files={files} />
            </div>
          </div>

          {expandedCategories.has(category) && (
            <div className="px-4 pb-4">
              {/* Base logs section */}
              <div className="mb-6">
                <h4 className="text-md font-medium text-gray-700 mb-3 flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-gray-500" />
                  Base Logs
                </h4>
                {files
                  .filter(file => !file.path.includes('/') && ['main.log', 'errors.log', 'audit.log'].includes(file.filename))
                  .map((file) => (
                    <div key={file.path} className="mt-2">
                      <FileRow
                        filename={file.filename}
                        size={file.size}
                        modified={file.modified}
                        hasContent={file.entries.length > 0}
                        isBaseLog={true}
                        onClick={() => toggleFile(file.path)}
                      />

                      {expandedFiles.has(file.path) && (
                        <div className="mt-4 ml-6">
                          <LogFileViewer 
                            file={file}
                            onRefresh={() => refreshLogFile(category, file.path)}
                            isRefreshing={refreshStates[file.path]}
                          />
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              {/* Specialized logs section */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-3 flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-gray-500" />
                  Specialized Logs
                </h4>
                {files
                  .filter(file => file.path.includes('/') || (!['main.log', 'errors.log', 'audit.log'].includes(file.filename)))
                  .map((file) => (
                    <div key={file.path} className="mt-2">
                      <FileRow
                        filename={file.filename}
                        size={file.size}
                        modified={file.modified}
                        hasContent={file.entries.length > 0}
                        onClick={() => toggleFile(file.path)}
                      />

                      {expandedFiles.has(file.path) && (
                        <div className="mt-4 ml-6">
                          <LogFileViewer 
                            file={file}
                            onRefresh={() => refreshLogFile(category, file.path)}
                            isRefreshing={refreshStates[file.path]}
                          />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}