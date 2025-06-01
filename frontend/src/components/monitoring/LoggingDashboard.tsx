'use client'

import { FC, useEffect } from 'react'
import { useMonitoringStore } from '@/store/monitoring'
import { ErrorRateMonitor } from './panels/ErrorRateMonitor'
import { ResponseTimeMonitor } from './panels/ResponseTimeMonitor'
import { LogVolumeMonitor } from './panels/LogVolumeMonitor'
import { RecentErrorsList } from './panels/RecentErrorsList'

export const LoggingDashboard: FC = () => {
  const fetchData = useMonitoringStore(state => state.fetchData)

  useEffect(() => {
    // Initial fetch
    fetchData()

    // Set up interval for periodic updates
    const interval = setInterval(fetchData, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [fetchData])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">System Logs</h2>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card rounded-lg p-4 border shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Error Rate</h3>
          <ErrorRateMonitor minimal />
        </div>
        <div className="bg-card rounded-lg p-4 border shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Response Time</h3>
          <ResponseTimeMonitor minimal />
        </div>
        <div className="bg-card rounded-lg p-4 border shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Log Volume</h3>
          <LogVolumeMonitor minimal />
        </div>
      </div>

      {/* Main Monitoring Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg p-6 border shadow-sm">
          <h3 className="text-lg font-medium mb-4">Error Rate Trend</h3>
          <ErrorRateMonitor />
        </div>
        <div className="bg-card rounded-lg p-6 border shadow-sm">
          <h3 className="text-lg font-medium mb-4">Response Time Trend</h3>
          <ResponseTimeMonitor />
        </div>
      </div>

      {/* Log Volume and Recent Errors */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg p-6 border shadow-sm">
          <h3 className="text-lg font-medium mb-4">Log Volume Distribution</h3>
          <LogVolumeMonitor />
        </div>
        <div className="bg-card rounded-lg p-6 border shadow-sm">
          <h3 className="text-lg font-medium mb-4">Recent Errors</h3>
          <RecentErrorsList />
        </div>
      </div>
    </div>
  )
}