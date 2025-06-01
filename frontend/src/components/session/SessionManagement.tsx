'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  Download, Upload, Trash2, Search, 
  FolderOpen, CheckCircle, X, FilterIcon 
} from 'lucide-react'
import type { StoredSession } from '@/lib/storage'
import { storage } from '@/lib/storage'

interface SessionManagementProps {
  isOpen: boolean
  onClose: () => void
  sessions: StoredSession[]
  currentSessionId: string
  onExport: (sessionIds?: string[]) => void
  onImport: (data: string) => void
  onDelete: (sessionId: string) => void
  onSelect: (sessionId: string) => void
}

export function SessionManagement({
  isOpen,
  onClose,
  sessions: initialSessions,
  currentSessionId,
  onExport,
  onImport,
  onDelete,
  onSelect
}: SessionManagementProps) {
  // Ensure sessions are properly initialized with safe defaults
  const [sessions, setSessions] = useState<StoredSession[]>(() => {
    // Initialize sessions
    if (!Array.isArray(initialSessions)) {
      // Handle invalid sessions format
      return [];
    }
    return initialSessions.map(session => ({
      id: session.id || crypto.randomUUID(),
      startTime: session.startTime || new Date().toISOString(),
      lastUpdated: session.lastUpdated || new Date().toISOString(),
      category: session.category || 'system',
      messageCount: session.messageCount || 0,
      title: session.title || 'New Chat'
    }));
  })
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [closing, setClosing] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Type guard for sessions
  const isValidSessions = (data: any): data is StoredSession[] => {
    return Array.isArray(data) && data.every(session => 
      typeof session === 'object' && 
      session !== null && 
      typeof session.id === 'string'
    )
  }

  // Keep sessions updated with optimized refresh strategy
  useEffect(() => {
    let mounted = true;
    let lastRefresh = 0;
    let updateTimeoutId: NodeJS.Timeout | null = null;

    const formatSessions = (rawSessions: any[]): StoredSession[] => {
      return rawSessions.map(session => ({
        id: session.id,
        startTime: session.startTime || new Date().toISOString(),
        lastUpdated: session.lastUpdated || new Date().toISOString(),
        category: session.category || 'system',
        messageCount: session.messageCount || 0,
        title: session.title || 'New Chat'
      }));
    };
    
    const scheduleNextUpdate = () => {
      if (updateTimeoutId) clearTimeout(updateTimeoutId);
      
      // More aggressive updates when dialog is first opened
      const timeSinceLastRefresh = Date.now() - lastRefresh;
      const updateDelay = timeSinceLastRefresh < 10000 ? 2000 : 5000;
      
      updateTimeoutId = setTimeout(refreshSessions, updateDelay);
    };

    const refreshSessions = async () => {
      if (!mounted || !isOpen) return;
      
      try {
        setLoading(prevLoading => {
          // Only show loading indicator for initial load
          return lastRefresh === 0 ? true : prevLoading;
        });

        const updatedSessions = await storage.getSessions();
        lastRefresh = Date.now();
        
        if (!mounted) return;
        
        if (isValidSessions(updatedSessions)) {
          const formattedSessions = formatSessions(updatedSessions);
          
          setSessions(prev => {
            // Only update if data has actually changed
            const hasChanged = JSON.stringify(prev) !== JSON.stringify(formattedSessions);
            if (hasChanged) {
              console.log('Session data updated:', formattedSessions);
              return formattedSessions;
            }
            return prev;
          });
        } else {
          console.warn('Invalid sessions data received');
        }
      } catch (error) {
        console.error('Session refresh failed:', error);
      } finally {
        if (mounted) {
          setLoading(false);
          scheduleNextUpdate();
        }
      }
    };

    // Initial load
    refreshSessions();

    return () => {
      mounted = false;
      if (updateTimeoutId) clearTimeout(updateTimeoutId);
    };
  }, [isOpen]) // Only re-run when dialog open state changes

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClose()
    }, 150)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const text = await file.text()
      onImport(text)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleExportSelected = () => {
    onExport(selectedSessions.size > 0 ? Array.from(selectedSessions) : undefined)
  }

  const toggleSessionSelection = (sessionId: string) => {
    const newSelected = new Set(selectedSessions)
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId)
    } else {
      newSelected.add(sessionId)
    }
    setSelectedSessions(newSelected)
  }

  const selectAll = () => {
    if (selectedSessions.size === sessions.length) {
      setSelectedSessions(new Set())
    } else {
      setSelectedSessions(new Set(sessions.map(s => s.id)))
    }
  }

  // Safe filtering with guaranteed array
  const filteredSessions = Array.isArray(sessions) ? sessions.filter(session => 
    (session?.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (session?.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) : []

  if (!isOpen) return null

  return (
    <div
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 
                 transition-opacity duration-150 
                 ${closing ? 'opacity-0' : 'opacity-100'}`}
    >
      <div
        className={`absolute inset-8 bg-white rounded-xl shadow-2xl
                   transform transition-all duration-150
                   ${closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Session Management</h2>
            <p className="text-sm text-gray-500">Manage your chat sessions</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 border-b">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search sessions..."
                className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportSelected}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <label className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <Upload className="h-4 w-4" />
                Import
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  disabled={loading}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        <div 
          className="max-h-[calc(100%-12rem)] overflow-y-auto p-4"
          ref={(el) => {
            if (el) {
              const handleScroll = () => {
                const isAtBottom = Math.abs((el.scrollHeight - el.scrollTop) - el.clientHeight) < 2;
                console.log('[ScrollSession] Sessions list scrolled:', {
                  scrollTop: el.scrollTop,
                  scrollHeight: el.scrollHeight,
                  clientHeight: el.clientHeight,
                  isAtBottom,
                  visibleSessions: Math.ceil(el.clientHeight / 76), // Approximate height per session
                  timestamp: new Date().toISOString()
                });
              };
              
              el.addEventListener('scroll', handleScroll);
              return () => el.removeEventListener('scroll', handleScroll);
            }
          }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No sessions found
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={selectAll}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  {selectedSessions.size === sessions.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-sm text-gray-500">
                  {selectedSessions.size} selected
                </span>
              </div>

              {filteredSessions.map(session => (
                <div
                  key={session.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    session.id === currentSessionId
                      ? 'border-indigo-200 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSessions.has(session.id)}
                    onChange={() => toggleSessionSelection(session.id)}
                    className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {session.title || 'Untitled Session'}
                      </span>
                      {session.id === currentSessionId && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>{new Date(session.startTime).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{session.messageCount} messages</span>
                      {session.category && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{session.category}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelect(session.id)}
                      className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors"
                      title="Switch to this session"
                    >
                      <CheckCircle className="h-5 w-5" />
                    </button>
                    {sessions.length > 1 && (
                      <button
                        onClick={() => onDelete(session.id)}
                        className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                        title="Delete session"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}