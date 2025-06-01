'use client'

import { FC, useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Filter, Search, X, RefreshCw, BarChart3 } from 'lucide-react'
import { LogEntryViewer } from './LogEntryViewer'
import { LogAnalytics } from './LogAnalytics'

interface LogFile {
  filename: string
  path: string
  size: number
  modified: string
  entries: any[]
}

interface Props {
  file: LogFile
  onRefresh?: () => Promise<void>
  isRefreshing?: boolean
}

export const LogFileViewer: FC<Props> = ({ file, onRefresh, isRefreshing }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)

  // Get unique log levels from entries
  const logLevels = useMemo(() => {
    const levels = new Set<string>()
    file.entries.forEach(entry => {
      if (entry.level) {
        levels.add(entry.level.toLowerCase())
      }
    })
    return Array.from(levels)
  }, [file.entries])

  // Filter entries based on search query and level filter
  const filteredEntries = useMemo(() => {
    return file.entries.filter(entry => {
      const matchesSearch = searchQuery === '' || 
        JSON.stringify(entry).toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesLevel = !levelFilter || 
        entry.level?.toLowerCase() === levelFilter.toLowerCase()
      
      return matchesSearch && matchesLevel
    })
  }, [file.entries, searchQuery, levelFilter])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="space-y-2">
        {/* Search and Filter Toggle */}
        <div className="flex gap-2">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className={`px-3 py-2 border rounded-md flex items-center gap-2 
                  ${isRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 border rounded-md flex items-center gap-2 
                ${showFilters ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {showFilters ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`px-3 py-2 border rounded-md flex items-center gap-2 
                ${showAnalytics ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
              {showAnalytics ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="p-4 border rounded-md bg-gray-50 space-y-2">
            <div className="font-medium text-sm text-gray-700">Log Level</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setLevelFilter(null)}
                className={`px-3 py-1 rounded-full text-sm
                  ${!levelFilter 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                All
              </button>
              {logLevels.map(level => (
                <button
                  key={level}
                  onClick={() => setLevelFilter(level)}
                  className={`px-3 py-1 rounded-full text-sm capitalize
                    ${levelFilter === level
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Summary */}
        <div className="text-sm text-gray-500">
          Showing {filteredEntries.length} of {file.entries.length} entries
          {levelFilter && ` (filtered by ${levelFilter})`}
          {searchQuery && ` (matching "${searchQuery}")`}
        </div>
      </div>

      {/* Analytics */}
      {showAnalytics && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <LogAnalytics entries={filteredEntries} />
        </div>
      )}

      {/* Log Entries */}
      <div className="space-y-2">
        {filteredEntries.map((entry, index) => (
          <LogEntryViewer key={index} entry={entry} />
        ))}
      </div>
    </div>
  )
}