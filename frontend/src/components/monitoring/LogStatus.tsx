'use client'

import { FC, useState, useEffect } from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'

interface FileInfo {
  name: string
  path: string
  size: number
  is_empty: boolean
  last_modified: string
}

interface CategoryStats {
  total_files: number
  non_empty_files: number
  total_size: number
  files: FileInfo[]
}

interface LogStats {
  total_files: number
  non_empty_files: number
  total_size: number
  categories: Record<string, CategoryStats>
}

export const LogStatus: FC = () => {
  const [stats, setStats] = useState<LogStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    try {
      setIsLoading(true)
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'
      const response = await fetch(`${baseUrl}/api/logs/status`)
      if (!response.ok) {
        throw new Error('Failed to fetch log status')
      }
      const data = await response.json()
      setStats(data.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load log status')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading log status...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        Error: {error}
      </div>
    )
  }

  if (!stats) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Global Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg bg-white">
          <h3 className="text-sm font-medium text-gray-500">Total Log Files</h3>
          <p className="mt-1 text-2xl font-semibold">{stats.total_files}</p>
        </div>
        <div className="p-4 border rounded-lg bg-white">
          <h3 className="text-sm font-medium text-gray-500">Non-Empty Files</h3>
          <p className="mt-1 text-2xl font-semibold">{stats.non_empty_files}</p>
          <p className="text-sm text-gray-500">
            {((stats.non_empty_files / stats.total_files) * 100).toFixed(1)}% of total
          </p>
        </div>
        <div className="p-4 border rounded-lg bg-white">
          <h3 className="text-sm font-medium text-gray-500">Total Size</h3>
          <p className="mt-1 text-2xl font-semibold">{formatSize(stats.total_size)}</p>
        </div>
      </div>

      {/* Category Stats */}
      <div className="space-y-4">
        {Object.entries(stats.categories).map(([category, catStats]) => (
          <div key={category} className="border rounded-lg overflow-hidden">
            <div className="p-4 bg-gray-50 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium capitalize">{category}</h3>
                <div className="text-sm text-gray-500">
                  {catStats.non_empty_files} / {catStats.total_files} files have content
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                Total Size: {formatSize(catStats.total_size)}
              </div>
            </div>

            <div className="p-4">
              {/* Base Logs Section */}
              {catStats.files.some(f => !f.path.includes('/') && ['main.log', 'errors.log', 'audit.log'].includes(f.name)) && (
                <div className="mb-6">
                  <h4 className="text-md font-medium text-gray-700 mb-3">Base Logs</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catStats.files
                      .filter(f => !f.path.includes('/') && ['main.log', 'errors.log', 'audit.log'].includes(f.name))
                      .map((file) => (
                        <div
                          key={file.path}
                          className={`p-3 rounded-lg border ${
                            file.is_empty ? 'bg-gray-50' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <FileText className={`w-5 h-5 mt-0.5 ${
                              file.is_empty ? 'text-gray-400' : 'text-blue-500'
                            }`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {file.name}
                              </p>
                              <p className="text-sm text-gray-500">
                                {file.is_empty ? 'Empty' : formatSize(file.size)}
                              </p>
                              <p className="text-xs text-gray-400">
                                Last modified: {format(new Date(file.last_modified), 'PPp')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Specialized Logs Section */}
              {catStats.files.some(f => f.path.includes('/') || (!['main.log', 'errors.log', 'audit.log'].includes(f.name))) && (
                <div>
                  <h4 className="text-md font-medium text-gray-700 mb-3">Specialized Logs</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catStats.files
                      .filter(f => f.path.includes('/') || (!['main.log', 'errors.log', 'audit.log'].includes(f.name)))
                      .map((file) => (
                        <div
                          key={file.path}
                          className={`p-3 rounded-lg border ${
                            file.is_empty ? 'bg-gray-50' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <FileText className={`w-5 h-5 mt-0.5 ${
                              file.is_empty ? 'text-gray-400' : 'text-blue-500'
                            }`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {file.name}
                              </p>
                              <p className="text-sm text-gray-500">
                                {file.is_empty ? 'Empty' : formatSize(file.size)}
                              </p>
                              <p className="text-xs text-gray-400">
                                Last modified: {format(new Date(file.last_modified), 'PPp')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={fetchStats}
          disabled={isLoading}
          className={`flex items-center gap-2 px-3 py-2 border rounded-md
            hover:bg-gray-50 transition-all
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Refreshing...' : 'Refresh Status'}</span>
        </button>
      </div>
    </div>
  )
}