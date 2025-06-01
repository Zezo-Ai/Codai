'use client'

import React, { useEffect, useState } from 'react'
import { 
  BarChart, CheckCircle, XCircle, Clock, 
  AlertTriangle, ArrowUpRight, RefreshCw 
} from 'lucide-react'
import { useRecoveryAnalytics } from '@/lib/recoveryAnalytics'

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

interface MetricCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: number
  description?: string
}

function MetricCard({ title, value, icon, trend, description }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="p-2 bg-indigo-50 rounded-lg">
          {icon}
        </div>
      </div>
      {(trend !== undefined || description) && (
        <div className="mt-2 flex items-center gap-2">
          {trend !== undefined && (
            <span className={cn(
              "text-xs font-medium",
              trend >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
          )}
          {description && (
            <span className="text-xs text-gray-500">{description}</span>
          )}
        </div>
      )}
    </div>
  )
}

interface ComponentAnalytics {
  attempts: number
  successes: number
  failures: number
  errorTypes: Record<string, number>
  recoveryStrategies: Record<string, number>
  averageTime: number
}

export function RecoveryDashboard() {
  const { getMetrics, getComponentMetrics } = useRecoveryAnalytics()
  const [metrics, setMetrics] = useState(getMetrics())
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null)
  const [componentMetrics, setComponentMetrics] = useState<ComponentAnalytics | null>(null)

  useEffect(() => {
    // Initial load
    const initialMetrics = getMetrics()
    setMetrics(initialMetrics)

    const updateInterval = setInterval(() => {
      const updatedMetrics = getMetrics()
      setMetrics(updatedMetrics)
      
      if (selectedComponent) {
        const updatedComponentMetrics = getComponentMetrics(selectedComponent)
        setComponentMetrics(updatedComponentMetrics)
      }
    }, 5000) // Update every 5 seconds

    return () => clearInterval(updateInterval)
  }, [selectedComponent])

  const handleComponentSelect = (component: string) => {
    setSelectedComponent(component)
    const componentData = getComponentMetrics(component)
    setComponentMetrics(componentData)
  }

  const handleRefresh = () => {
    const updatedMetrics = getMetrics()
    setMetrics(updatedMetrics)
    
    if (selectedComponent) {
      const updatedComponentMetrics = getComponentMetrics(selectedComponent)
      setComponentMetrics(updatedComponentMetrics)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recovery Analytics</h1>
          <p className="text-sm text-gray-600">
            Monitor system recovery performance and patterns
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium 
                     text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 
                     rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Recovery Success Rate"
          value={`${metrics.recoverySuccessRate.toFixed(1)}%`}
          icon={<BarChart className="h-5 w-5 text-indigo-600" />}
          description="Overall success rate"
        />
        <MetricCard
          title="Successful Recoveries"
          value={metrics.successfulRecoveries}
          icon={<CheckCircle className="h-5 w-5 text-green-600" />}
          trend={metrics.totalAttempts > 0 ? 
            (metrics.successfulRecoveries / metrics.totalAttempts) * 100 : 0}
        />
        <MetricCard
          title="Failed Recoveries"
          value={metrics.failedRecoveries}
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          trend={metrics.totalAttempts > 0 ? 
            -(metrics.failedRecoveries / metrics.totalAttempts) * 100 : 0}
        />
        <MetricCard
          title="Avg Recovery Time"
          value={`${metrics.averageRecoveryTime.toFixed(0)}ms`}
          icon={<Clock className="h-5 w-5 text-indigo-600" />}
          description="Average recovery duration"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Common Errors
            </h2>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              {metrics.commonErrors.map((error, index) => (
                <div 
                  key={error.type}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 
                                   rounded-full bg-red-100 text-xs font-medium 
                                   text-red-600">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {error.type}
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {error.count} occurrences
                  </span>
                </div>
              ))}
              {metrics.commonErrors.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">
                  No errors recorded
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Component Performance
            </h2>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              {Object.entries(metrics.componentStats).map(([component, stats]) => (
                <button
                  key={component}
                  onClick={() => handleComponentSelect(component)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-lg",
                    "hover:bg-gray-50 transition-colors text-left",
                    selectedComponent === component && "bg-indigo-50"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {component}
                    </p>
                    <p className="text-xs text-gray-500">
                      {stats.attempts} attempts, {stats.successes} successful
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {stats.attempts > 0 
                        ? ((stats.successes / stats.attempts) * 100).toFixed(1)
                        : '0.0'}%
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              ))}
              {Object.keys(metrics.componentStats).length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">
                  No component data available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedComponent && componentMetrics && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedComponent} Details
              </h2>
              <button
                onClick={() => setSelectedComponent(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-600">
                  Error Types
                </h3>
                {Object.entries(componentMetrics.errorTypes).length > 0 ? (
                  Object.entries(componentMetrics.errorTypes).map(([type, count]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between p-2 
                               bg-red-50 rounded-lg"
                    >
                      <span className="text-sm text-red-600">{type}</span>
                      <span className="text-sm font-medium text-red-700">
                        {count}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500 p-2">
                    No errors recorded
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-600">
                  Recovery Strategies
                </h3>
                {Object.entries(componentMetrics.recoveryStrategies).length > 0 ? (
                  Object.entries(componentMetrics.recoveryStrategies)
                    .map(([strategy, count]) => (
                      <div
                        key={strategy}
                        className="flex items-center justify-between p-2 
                                 bg-indigo-50 rounded-lg"
                      >
                        <span className="text-sm text-indigo-600">{strategy}</span>
                        <span className="text-sm font-medium text-indigo-700">
                          {count}
                        </span>
                      </div>
                    ))
                ) : (
                  <div className="text-sm text-gray-500 p-2">
                    No strategies recorded
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-1">
                    Success Rate
                  </h3>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{
                        width: `${componentMetrics.attempts > 0 
                          ? (componentMetrics.successes / componentMetrics.attempts) * 100 
                          : 0}%`
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {componentMetrics.attempts > 0
                      ? ((componentMetrics.successes / componentMetrics.attempts) * 100).toFixed(1)
                      : '0.0'}% successful
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-1">
                    Average Recovery Time
                  </h3>
                  <p className="text-2xl font-semibold text-gray-900">
                    {componentMetrics.averageTime.toFixed(0)}ms
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}