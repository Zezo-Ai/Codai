'use client'

import { FC, useMemo } from 'react'
import { BarChart, LineChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO, subHours } from 'date-fns'

interface LogEntry {
  timestamp: string
  level: string
  message: string
  component?: string
  response_time?: number
  endpoint?: string
  [key: string]: any
}

interface Props {
  entries: LogEntry[]
}

export const LogAnalytics: FC<Props> = ({ entries }) => {
  // 1. Error Rate Over Time
  const errorRateData = useMemo(() => {
    const timeWindows = new Map<string, { total: number; errors: number }>()
    const now = new Date()
    
    // Initialize last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hour = format(subHours(now, i), 'yyyy-MM-dd HH:00')
      timeWindows.set(hour, { total: 0, errors: 0 })
    }
    
    // Count errors per hour
    entries.forEach(entry => {
      const hour = format(parseISO(entry.timestamp), 'yyyy-MM-dd HH:00')
      const stats = timeWindows.get(hour) || { total: 0, errors: 0 }
      stats.total++
      if (entry.level?.toLowerCase() === 'error') {
        stats.errors++
      }
      timeWindows.set(hour, stats)
    })
    
    return Array.from(timeWindows.entries()).map(([hour, stats]) => ({
      hour,
      rate: stats.total > 0 ? (stats.errors / stats.total) * 100 : 0
    }))
  }, [entries])

  // 2. Response Time Distribution
  const responseTimeStats = useMemo(() => {
    const times = entries
      .filter(e => typeof e.response_time === 'number')
      .map(e => e.response_time as number)
    
    if (times.length === 0) return null

    const sorted = [...times].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const p99 = sorted[Math.floor(sorted.length * 0.99)]
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    
    return { p95, p99, avg }
  }, [entries])

  // 3. Error Distribution by Component
  const errorsByComponent = useMemo(() => {
    const counts = new Map<string, number>()
    
    entries
      .filter(e => e.level?.toLowerCase() === 'error')
      .forEach(entry => {
        const component = entry.component || 'unknown'
        counts.set(component, (counts.get(component) || 0) + 1)
      })
    
    return Array.from(counts.entries())
      .map(([component, count]) => ({ component, count }))
      .sort((a, b) => b.count - a.count)
  }, [entries])

  // 4. Most Common Error Patterns
  const errorPatterns = useMemo(() => {
    const patterns = new Map<string, { count: number; examples: string[] }>()
    
    entries
      .filter(e => e.level?.toLowerCase() === 'error')
      .forEach(entry => {
        // Simplify error message to find patterns
        const pattern = entry.message
          .replace(/[0-9]+/g, 'N')
          .replace(/'[^']+'/g, 'STR')
          .replace(/"[^"]+"/g, 'STR')
          
        const existing = patterns.get(pattern) || { count: 0, examples: [] }
        existing.count++
        if (existing.examples.length < 3) {
          existing.examples.push(entry.message)
        }
        patterns.set(pattern, existing)
      })
    
    return Array.from(patterns.entries())
      .map(([pattern, data]) => ({
        pattern,
        ...data
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [entries])

  // 5. Activity Heatmap
  const activityByHour = useMemo(() => {
    const hours = new Map<number, number>()
    
    entries.forEach(entry => {
      const hour = parseISO(entry.timestamp).getHours()
      hours.set(hour, (hours.get(hour) || 0) + 1)
    })
    
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hours.get(hour) || 0
    }))
  }, [entries])

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg">
          <h3 className="text-sm font-medium text-gray-600">Total Entries</h3>
          <p className="text-2xl font-semibold">{entries.length}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <h3 className="text-sm font-medium text-gray-600">Error Rate</h3>
          <p className="text-2xl font-semibold">
            {((entries.filter(e => e.level?.toLowerCase() === 'error').length / entries.length) * 100).toFixed(1)}%
          </p>
        </div>
        {responseTimeStats && (
          <div className="p-4 border rounded-lg">
            <h3 className="text-sm font-medium text-gray-600">Avg Response Time</h3>
            <p className="text-2xl font-semibold">{responseTimeStats.avg.toFixed(0)}ms</p>
            <p className="text-xs text-gray-500">P95: {responseTimeStats.p95.toFixed(0)}ms</p>
          </div>
        )}
      </div>

      {/* Error Rate Over Time */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-medium mb-4">Error Rate Trend</h3>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={errorRateData}>
              <XAxis 
                dataKey="hour"
                tickFormatter={(value) => format(parseISO(value), 'HH:mm')}
              />
              <YAxis 
                tickFormatter={(value) => `${value.toFixed(1)}%`}
              />
              <Tooltip 
                labelFormatter={(value) => format(parseISO(value), 'MMM dd, HH:mm')}
                formatter={(value: number) => [`${value.toFixed(2)}%`, 'Error Rate']}
              />
              <Line 
                type="monotone"
                dataKey="rate"
                stroke="#ef4444"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Errors by Component */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-medium mb-4">Errors by Component</h3>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={errorsByComponent}>
              <XAxis dataKey="component" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Common Error Patterns */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-medium mb-4">Common Error Patterns</h3>
        <div className="space-y-4">
          {errorPatterns.map((pattern, index) => (
            <div key={index} className="border-b pb-4 last:border-0">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="font-medium">Pattern {index + 1}</p>
                  <p className="text-sm text-gray-600">{pattern.pattern}</p>
                </div>
                <span className="text-sm font-medium bg-red-100 text-red-800 px-2 py-1 rounded">
                  {pattern.count}×
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {pattern.examples.map((example, i) => (
                  <p key={i} className="text-sm text-gray-500">
                    Example {i + 1}: {example}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Heatmap */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-medium mb-4">Activity by Hour</h3>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityByHour}>
              <XAxis 
                dataKey="hour"
                tickFormatter={(hour) => `${hour}:00`}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(hour) => `${hour}:00 - ${hour + 1}:00`}
              />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}