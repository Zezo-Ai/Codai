'use client'

import { useState, useEffect } from 'react'
import diagnosticLogger, { DiagnosticArea } from '@/lib/diagnosticLogger'

export function DiagnosticCollector() {
  const [isVisible, setIsVisible] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  
  // Toggle visibility with keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+Shift+D to toggle diagnostic panel
      if (e.altKey && e.shiftKey && e.key === 'd') {
        setIsVisible(prev => !prev)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  // Start recording diagnostics
  const startRecording = () => {
    const newSessionId = diagnosticLogger.beginDiagnosticSession({
      userInitiated: true,
      timestamp: new Date().toISOString(),
      url: window.location.href
    })
    
    setSessionId(newSessionId)
    setIsRecording(true)
    setStatusMessage('Recording diagnostic data...')
    
    diagnosticLogger.info(
      DiagnosticArea.SYSTEM, 
      'DiagnosticCollector',
      'User initiated',
      'User started diagnostic recording'
    )
  }
  
  // Stop recording diagnostics
  const stopRecording = () => {
    if (sessionId) {
      diagnosticLogger.info(
        DiagnosticArea.SYSTEM,
        'DiagnosticCollector',
        'User stopped',
        'User stopped diagnostic recording'
      )
      
      diagnosticLogger.endDiagnosticSession()
      setIsRecording(false)
      setStatusMessage('Recording stopped. Ready to export report.')
    }
  }
  
  // Generate and export diagnostic report
  const exportDiagnosticReport = () => {
    if (!sessionId) {
      setStatusMessage('No diagnostic session available to export')
      return
    }
    
    try {
      const report = diagnosticLogger.createDiagnosticReport(sessionId)
      
      // Create file for download
      const blob = new Blob([report], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const filename = `webui-diagnostic-${new Date().toISOString().replace(/:/g, '-')}.json`
      
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)
      
      setStatusMessage(`Report exported as ${filename}`)
    } catch (e) {
      setStatusMessage('Error exporting diagnostic report')
      console.error('Export error:', e)
    }
  }
  
  // Clear all logs
  const clearLogs = () => {
    diagnosticLogger.clearLogs()
    setSessionId(null)
    setIsRecording(false)
    setStatusMessage('Diagnostic logs cleared')
  }
  
  if (!isVisible) {
    return null
  }
  
  return (
    <div className="fixed bottom-4 right-4 p-4 bg-gray-900 text-white rounded-lg shadow-lg z-50 max-w-md">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium">Web UI Diagnostics</h3>
        <button 
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      
      <div className="text-sm mb-4">
        <p className="mb-2">
          Record diagnostic data to troubleshoot formatting and display issues.
        </p>
        <p className="text-yellow-400 text-xs mb-3">
          Send the exported file to support for analysis.
        </p>
        
        <div className="border-t border-gray-700 pt-3 flex flex-col gap-3">
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            >
              Stop Recording
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              disabled={!!sessionId}
            >
              Start Recording
            </button>
          )}
          
          <button
            onClick={exportDiagnosticReport}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            disabled={!sessionId}
          >
            Export Diagnostic Report
          </button>
          
          <button
            onClick={clearLogs}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
          >
            Clear Diagnostic Data
          </button>
        </div>
        
        {statusMessage && (
          <div className="mt-3 p-2 bg-gray-800 rounded text-xs">
            {statusMessage}
          </div>
        )}
      </div>
      
      <div className="text-xs text-gray-400">
        Press Alt+Shift+D to hide this panel
      </div>
    </div>
  )
}