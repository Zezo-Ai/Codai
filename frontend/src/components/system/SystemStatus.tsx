'use client'

import React, { useState, useEffect } from 'react'
import { Activity, AlertTriangle, CheckCircle2, XCircle, Clock, BarChart2 } from 'lucide-react'
import { useSystemMonitor } from '@/hooks/useSystemMonitor'
import { SystemStatusState } from '@/types/status'
import { AiModeSwitcher } from '@/components/chat/AiModeSwitcher'
import { useAiMode } from '@/hooks/useAiMode'
import { AiModeErrorBoundary } from '@/components/error/AiModeErrorBoundary'

const statusConfig: Record<SystemStatusState, {
  label: string
  color: string
  bgColor: string
  icon: JSX.Element
}> = {
  operational: {
    label: 'System Operational',
    color: 'bg-emerald-400',
    bgColor: 'bg-emerald-50',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  },
  degraded: {
    label: 'System Degraded',
    color: 'bg-yellow-400',
    bgColor: 'bg-yellow-50',
    icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />
  },
  down: {
    label: 'System Down',
    color: 'bg-red-400',
    bgColor: 'bg-red-50',
    icon: <XCircle className="h-4 w-4 text-red-500" />
  }
}

export function SystemStatus() {
  const status = useSystemMonitor()
  const { currentMode, setMode, error: aiModeError, clearError } = useAiMode()
  const currentStatus = statusConfig[status.state]
  const [mounted, setMounted] = useState(false)

  // Monitor status changes
  useEffect(() => {
    // No logging needed
  }, [status.state, status.latency.current, mounted]);
  
  // Clear AI mode error after a delay
  useEffect(() => {
    if (aiModeError) {
      const timer = setTimeout(() => {
        clearError()
      }, 5000) // Clear after 5 seconds
      
      return () => clearTimeout(timer)
    }
  }, [aiModeError, clearError])

  useEffect(() => {
    setMounted(true)
  }, [])

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours}h ${minutes}m ${secs}s`
  }

  const getLatencyColor = (latency: number) => {
    // Adjust thresholds to match our monitoring thresholds
    if (latency < 200) return 'text-emerald-500'
    if (latency < 400) return 'text-yellow-500'
    return 'text-red-500'
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-gray-50">
            <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
            <span className="text-xs text-gray-600">Checking Status...</span>
          </div>
        </div>
        <div className="w-32 h-8 bg-gray-100 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between w-full px-4 py-2">
      {/* Left side - System Status */}
      <div className="flex items-center space-x-4 flex-1">
        {/* Status Indicator */}
        <div 
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-full ${currentStatus.bgColor} cursor-pointer flex-shrink-0`}
          onClick={() => {
            if (status.resetStatus) status.resetStatus();
          }}
          title="Click to refresh status"
        >
          <span className={`w-2 h-2 rounded-full animate-pulse ${currentStatus.color}`} />
          <span className="text-xs font-medium text-gray-700">{currentStatus.label}</span>
        </div>
        
        <div className="h-4 border-r border-gray-200" />
        
        {/* Latency Display */}
        <div className="flex items-center space-x-2">
          <Activity className={`h-4 w-4 ${getLatencyColor(status.latency.current)}`} />
          <div className="flex items-center">
            <span className={`text-xs font-medium inline-block w-12 text-right ${getLatencyColor(status.latency.current)}`}>
              {status.latency.current}ms
            </span>
            {status.state !== 'operational' && status.latency.current < 200 && 
              <span className="ml-1 text-xs text-gray-400">(Recalculating...)</span>
            }
          </div>
        </div>

        {/* Status Details Popup */}
        <div className="relative group">
          {currentStatus.icon}
          
          <div className="absolute hidden group-hover:block top-full mt-2 right-0 w-80 p-4 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <span className="font-medium text-gray-900">System Status</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                status.state === 'operational' ? 'bg-emerald-100 text-emerald-700' :
                status.state === 'degraded' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {currentStatus.label}
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Latency Section */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 flex items-center gap-1">
                  <Activity className="h-3 w-3" /> Latency Metrics
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Current</span>
                    <span className={`text-xs font-medium ${getLatencyColor(status.latency.current)}`}>
                      {status.latency.current}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Average</span>
                    <span className="text-xs font-medium text-gray-900">
                      {Math.round(status.latency.average)}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Peak</span>
                    <span className="text-xs font-medium text-gray-900">
                      {status.latency.peak}ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Requests Section */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 flex items-center gap-1">
                  <BarChart2 className="h-3 w-3" /> Request Stats
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Success Rate</span>
                    <span className="text-xs font-medium text-emerald-600">
                      {((1 - status.errors.rate) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Total</span>
                    <span className="text-xs font-medium text-gray-900">
                      {status.api.totalRequests}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Failed</span>
                    <span className="text-xs font-medium text-red-600">
                      {status.api.failedRequests}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Stats */}
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Uptime
                </span>
                <span className="text-xs font-medium text-gray-900">
                  {formatUptime(status.connection.uptime)}
                </span>
              </div>
              {status.errors.lastError && (
                <div className="text-xs text-red-500 mt-2 p-2 bg-red-50 rounded">
                  Last Error: {status.errors.lastError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Right side - AI Mode Switcher */}
      <div className="flex items-center relative flex-shrink-0">
        <AiModeErrorBoundary>
          <AiModeSwitcher 
            currentMode={currentMode}
            onModeChange={setMode}
            compact={true}
            className="ml-4"
          />
        </AiModeErrorBoundary>
        
        {/* AI Mode Error Display */}
        {aiModeError && (
          <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md shadow-lg z-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{aiModeError}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}