'use client'

import { FC } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMonitoringStore } from '@/store/monitoring'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  minimal?: boolean
}

export const ResponseTimeMonitor: FC<Props> = ({ minimal = false }) => {
  const { responseTimes, isLoading } = useMonitoringStore()

  if (isLoading) {
    return <Skeleton className={minimal ? "h-8" : "h-[300px]"} />
  }

  if (minimal) {
    const currentTime = responseTimes[responseTimes.length - 1]?.time ?? 0
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">
          {currentTime.toFixed(0)}
        </span>
        <span className="text-sm text-muted-foreground">
          ms avg
        </span>
      </div>
    )
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={responseTimes}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="responseTime" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="timestamp"
            tickFormatter={(value) => new Date(value).toLocaleTimeString()}
            fontSize={12}
          />
          <YAxis 
            tickFormatter={(value) => `${value}ms`}
            fontSize={12}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px'
            }}
            labelStyle={{ color: '#fff' }}
            labelFormatter={(value) => new Date(value).toLocaleString()}
          />
          <Area
            type="monotone"
            dataKey="time"
            stroke="#3b82f6"
            fillOpacity={1}
            fill="url(#responseTime)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}