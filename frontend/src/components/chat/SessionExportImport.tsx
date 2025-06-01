'use client'

import { useState, useRef } from 'react'
import { 
  Download, Upload, Trash2, Search, 
  X, FileJson, Loader2, FolderOpen 
} from 'lucide-react'
import type { StoredSession } from '@/lib/storage'
import { cn } from '@/lib/utils'

interface SessionExportImportProps {
  sessions: StoredSession[]
  onExport: (sessionIds?: string[]) => Promise<void>
  onImport: (data: string) => Promise<void>
  className?: string
  disabled?: boolean
}

interface ImportState {
  status: 'idle' | 'loading' | 'success' | 'error'
  message: string
  fileName?: string
  isProcessing: boolean
}

export function SessionExportImport({ 
  sessions, 
  onExport, 
  onImport, 
  className = '',
  disabled = false
}: SessionExportImportProps) {
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [importState, setImportState] = useState<ImportState>({
    status: 'idle',
    message: '',
    isProcessing: false
  })
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSelectAll = () => {
    if (selectedSessions.size === sessions.length) {
      setSelectedSessions(new Set())
    } else {
      setSelectedSessions(new Set(sessions.map(s => s.id)))
    }
  }

  const handleExport = async () => {
    if (disabled || importState.isProcessing) return
    try {
      const sessionIds = selectedSessions.size > 0 
        ? Array.from(selectedSessions)
        : undefined

      await onExport(sessionIds)
      setShowExportModal(false)
      setSelectedSessions(new Set())
    } catch (error) {
      console.error('Export error:', error)
    }
  }

  const handleImportClick = () => {
    setImportState({ status: 'idle', message: '', isProcessing: false })
    setShowImportModal(true)
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0]
      if (!file) return

      setImportState({
        status: 'loading',
        message: 'Reading file...',
        fileName: file.name,
        isProcessing: true
      })

      if (!file.name.endsWith('.json')) {
        throw new Error('Please select a JSON file')
      }

      const text = await file.text()
      
      // Validate JSON structure
      const data = JSON.parse(text)
      if (!data.version || !data.sessions || !Array.isArray(data.sessions)) {
        throw new Error('Invalid session data format')
      }

      await onImport(text)
      
      setImportState({
        status: 'success',
        message: 'Sessions imported successfully',
        fileName: file.name,
        isProcessing: false
      })

      setTimeout(() => {
        setShowImportModal(false)
        setImportState({ status: 'idle', message: '', isProcessing: false })
      }, 1500)
    } catch (error) {
      setImportState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to import sessions',
        fileName: event.target.files?.[0]?.name,
        isProcessing: false
      })
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Filter sessions based on search term
  const filteredSessions = sessions.filter(session => 
    session.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    session.category?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowExportModal(true)}
          disabled={disabled || importState.isProcessing}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg transition-colors",
            "hover:bg-indigo-100",
            (disabled || importState.isProcessing) && "opacity-50 cursor-not-allowed"
          )}
        >
          <Download className="h-4 w-4" />
          Export
        </button>

        <button
          onClick={handleImportClick}
          disabled={disabled || importState.isProcessing}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg transition-colors",
            "hover:bg-indigo-100",
            (disabled || importState.isProcessing) && "opacity-50 cursor-not-allowed"
          )}
        >
          <Upload className="h-4 w-4" />
          Import
        </button>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Export Sessions</h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Select Sessions to Export
                  </label>
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    {selectedSessions.size === sessions.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2">
                  {filteredSessions.map(session => (
                    <label
                      key={session.id}
                      className="flex items-center p-3 rounded-lg hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSessions.has(session.id)}
                        onChange={() => {
                          const newSelected = new Set(selectedSessions)
                          if (newSelected.has(session.id)) {
                            newSelected.delete(session.id)
                          } else {
                            newSelected.add(session.id)
                          }
                          setSelectedSessions(newSelected)
                        }}
                        className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      />
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {session.title || 'Untitled Session'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(session.startTime).toLocaleDateString()} • {session.messageCount} messages
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
                Export {selectedSessions.size ? `(${selectedSessions.size})` : 'All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Import Sessions</h2>
              <button
                onClick={() => {
                  setShowImportModal(false)
                  setImportState({ status: 'idle', message: '', isProcessing: false })
                }}
                className="text-gray-500 hover:text-gray-700"
                disabled={importState.isProcessing}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {importState.status === 'idle' ? (
                <div className="text-center">
                  <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mb-4">
                    <FileJson className="h-6 w-6" />
                  </div>
                  <label className="block">
                    <span className="sr-only">Choose JSON file</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileSelect}
                      disabled={importState.isProcessing}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
                    />
                  </label>
                  <p className="mt-2 text-xs text-gray-500">
                    Select a JSON file exported from CODAI
                  </p>
                </div>
              ) : (
                <div className="text-center p-4">
                  {importState.status === 'loading' && (
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                      <span className="text-sm text-gray-600">{importState.message}</span>
                    </div>
                  )}
                  {importState.status === 'success' && (
                    <div className="flex items-center justify-center gap-3 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm">{importState.message}</span>
                    </div>
                  )}
                  {importState.status === 'error' && (
                    <div className="flex items-center justify-center gap-3 text-red-600">
                      <AlertCircle className="h-5 w-5" />
                      <span className="text-sm">{importState.message}</span>
                    </div>
                  )}
                  {importState.fileName && (
                    <div className="mt-2 text-xs text-gray-500">
                      File: {importState.fileName}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => {
                  setShowImportModal(false)
                  setImportState({ status: 'idle', message: '', isProcessing: false })
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={importState.isProcessing}
              >
                {importState.status === 'success' ? 'Close' : 'Cancel'}
              </button>
              {importState.status === 'idle' && (
                <label className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer">
                  <FolderOpen className="h-4 w-4" />
                  Choose File
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    disabled={importState.isProcessing}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}