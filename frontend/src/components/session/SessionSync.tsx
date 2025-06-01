'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { 
  Cloud, 
  CloudOff, 
  AlertCircle, 
  RefreshCw, 
  Clock, 
  Loader2,
  Check,
  Info,
  AlertTriangle,
  XCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Database,
  Settings
} from 'lucide-react'
import { useSessionManager } from '@/lib/sessionManager'

// Activity type mapping for icons and colors
const ActivityTypes = {
  success: { icon: Check, color: 'text-green-500', bg: 'bg-green-50' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  sync: { icon: RefreshCw, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  upload: { icon: ArrowUpCircle, color: 'text-purple-500', bg: 'bg-purple-50' },
  download: { icon: ArrowDownCircle, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  database: { icon: Database, color: 'text-slate-500', bg: 'bg-slate-50' },
  system: { icon: Settings, color: 'text-gray-500', bg: 'bg-gray-50' }
} as const

type ActivityType = keyof typeof ActivityTypes

// Helper function to determine activity type from message and event type
const getActivityType = (message: string, eventType?: string): ActivityType => {
  if (!message) return 'info'
  
  const lowerMessage = message.toLowerCase()
  
  // Match event types first
  if (eventType === 'error') return 'error'
  if (eventType === 'sync_complete') return 'success'
  if (eventType === 'sync_start') return 'sync'
  if (eventType === 'database_change') return 'database'
  if (eventType === 'initialization') return 'system'
  
  // Then check message content
  if (lowerMessage.includes('error') || lowerMessage.includes('failed')) return 'error'
  if (lowerMessage.includes('warning')) return 'warning'
  if (lowerMessage.includes('sync')) return 'sync'
  if (lowerMessage.includes('stored') || lowerMessage.includes('saved')) return 'upload'
  if (lowerMessage.includes('retrieved') || lowerMessage.includes('loaded')) return 'download'
  if (lowerMessage.includes('success')) return 'success'
  if (lowerMessage.includes('indexeddb') || lowerMessage.includes('database')) return 'database'
  if (lowerMessage.includes('initializ')) return 'system'
  
  return 'info'
}

const formatRelativeTime = (timestamp: string) => {
  if (!timestamp) return 'Unknown'
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 5) return 'Just now'
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    return date.toLocaleDateString()
  } catch {
    return 'Invalid date'
  }
}

interface ActivityItemProps {
  log: string
  eventType?: string
}

const RecentActivityItem = ({ log, eventType }: ActivityItemProps) => {
  if (!log) return null
  
  const [timestamp, ...messageParts] = log.split(': ')
  const message = messageParts.join(': ')
  const type = getActivityType(message, eventType)
  const { icon: Icon, color, bg } = ActivityTypes[type]

  return (
    <div className="flex items-start gap-2 py-1.5 group hover:bg-gray-50 rounded px-1 -mx-1 transition-colors">
      <div className={`mt-0.5 p-1 rounded ${bg} ${color}`}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-600 break-words leading-relaxed">
          {message || 'Unknown activity'}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatRelativeTime(timestamp)}
        </p>
      </div>
    </div>
  )
}

export function SessionSync() {
  const { getSyncStatus, addSyncListener, getDebugLogs } = useSessionManager()
  const [status, setStatus] = useState(() => ({
    lastSyncTime: 0,
    isInitialized: false,
    pendingChanges: false,
    syncErrors: [],
    debugLogs: [],
    pendingSessions: [],
    currentOperation: undefined
  }))
  const [showDetails, setShowDetails] = useState(false)
  const [debugLogs, setDebugLogs] = useState<string[]>([])
  const [activityCount, setActivityCount] = useState(5)
  const [lastEventType, setLastEventType] = useState<string>()
  const updateTimeoutRef = useRef<NodeJS.Timeout>()

  const updateStatus = useCallback((event?: any) => {
    // Only update for significant events or initial load
    if (!event || [
      'error',
      'sync_complete',
      'sync_start',
      'initialization',
      'database_change'
    ].includes(event.type)) {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }

      updateTimeoutRef.current = setTimeout(() => {
        const currentStatus = getSyncStatus()
        const currentLogs = getDebugLogs?.() || []
        
        setStatus(currentStatus)
        setDebugLogs(currentLogs)
        if (event?.type) {
          setLastEventType(event.type)
        }
      }, 100)
    }
  }, [getSyncStatus, getDebugLogs])

  useEffect(() => {
    // Initial load
    updateStatus()
    
    // Listen for events
    const removeListener = addSyncListener((event) => {
      updateStatus(event)
    })

    return () => {
      removeListener()
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [updateStatus, addSyncListener])

  const getStatusIcon = useCallback(() => {
    if (!status.isInitialized) {
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
    }
    if (status.syncErrors.length > 0) {
      return <AlertCircle className="h-4 w-4 text-red-500" />
    }
    if (status.pendingChanges) {
      return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
    }
    return <Cloud className="h-4 w-4 text-green-500" />
  }, [status.isInitialized, status.syncErrors.length, status.pendingChanges])

  const getStatusText = useCallback(() => {
    if (!status.isInitialized) {
      return 'Initializing...'
    }
    if (status.syncErrors.length > 0) {
      return 'Sync Error'
    }
    if (status.pendingChanges) {
      return `Syncing${status.pendingSessions.length ? ` (${status.pendingSessions.length})` : '...'}`
    }
    return 'Synced'
  }, [status])

  const formatTime = useCallback((timestamp: number) => {
    if (!status.isInitialized) return 'Initializing...'
    if (!timestamp) return 'Not yet synced'
    try {
      return new Date(timestamp).toLocaleTimeString()
    } catch {
      return 'Invalid time'
    }
  }, [status.isInitialized])

  const showMoreActivities = () => {
    setActivityCount(prev => prev + 5)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-full
                   hover:bg-gray-100 transition-colors"
        title={status.syncErrors.length > 0 ? 'View sync errors' : 'View sync status'}
      >
        {getStatusIcon()}
        <span className="text-gray-600">{getStatusText()}</span>
      </button>

      {showDetails && (
        <div className="absolute top-full mt-2 right-0 w-96 bg-white 
                      rounded-lg shadow-lg border border-gray-200 p-3 z-50
                      max-h-[calc(100vh-100px)] overflow-y-auto
                      sm:-right-2 sm:transform sm:-translate-x-0">
          <div className="space-y-4">
            {/* Status Section */}
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Sync Status</span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  !status.isInitialized ? 'bg-blue-50 text-blue-700' :
                  status.syncErrors.length > 0 ? 'bg-red-50 text-red-700' :
                  status.pendingChanges ? 'bg-yellow-50 text-yellow-700' :
                  'bg-green-50 text-green-700'
                }`}>
                  {!status.isInitialized ? 'Initializing' :
                   status.syncErrors.length > 0 ? 'Error' :
                   status.pendingChanges ? 'Syncing' : 
                   'Connected'}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-gray-600">
                  <Clock className="h-3 w-3" />
                  <span>Last Sync</span>
                </div>
                <span className="text-gray-900 font-medium">
                  {formatTime(status.lastSyncTime)}
                </span>
              </div>

              {status.currentOperation && (
                <div className="flex items-center gap-2 text-xs text-yellow-600">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>{status.currentOperation}</span>
                </div>
              )}

              {status.pendingSessions.length > 0 && (
                <div className="text-xs text-gray-600 flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  Pending sessions: {status.pendingSessions.length}
                </div>
              )}
            </div>

            {/* Errors Section */}
            {status.syncErrors.length > 0 && (
              <div className="space-y-1 border-t border-gray-100 pt-3">
                <span className="text-xs font-medium text-red-600">
                  Sync Errors ({status.syncErrors.length})
                </span>
                <ul className="text-xs text-red-500 space-y-1">
                  {status.syncErrors.map((error, index) => (
                    <li key={index} className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recent Activities Section */}
            {debugLogs.length > 0 && (
              <div className="space-y-2 border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">Recent Activities</span>
                  <span className="text-[10px] text-gray-400">
                    Showing {Math.min(activityCount, debugLogs.length)} of {debugLogs.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {debugLogs.slice(0, activityCount).map((log, index) => (
                    <RecentActivityItem 
                      key={index} 
                      log={log}
                      eventType={lastEventType}
                    />
                  ))}
                </div>
                {debugLogs.length > activityCount && (
                  <button
                    onClick={showMoreActivities}
                    className="text-xs text-blue-500 hover:text-blue-600 transition-colors
                             w-full text-center py-1 mt-1 rounded-md hover:bg-blue-50"
                  >
                    Show More Activities
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showDetails && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => setShowDetails(false)}
        />
      )}
    </div>
  )
}