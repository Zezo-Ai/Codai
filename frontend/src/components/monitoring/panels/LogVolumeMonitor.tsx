'use client'

import { FC } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMonitoringStore } from '@/store/monitoring'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  minimal?: boolean
}

export const LogVolumeMonitor: FC<Props> = ({ minimal = false }) => {
  const { volumeStats, isLoading } = useMonitoringStore()

  if (isLoading) {
    return <Skeleton className={minimal ? "h-8" : "h-[300px]"} />
  }

  if (minimal) {
    const totalVolume = volumeStats.reduce((acc, curr) => acc + curr.volume, 0)
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">
          {totalVolume.toFixed(1)}
        </span>
        <span className="text-sm text-muted-foreground">
          MB total
        </span>
      </div>
    )
  }

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={volumeStats}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <XAxis 
            dataKey="category"
            fontSize={12}
          />
          <YAxis 
            tickFormatter={(value) => `${value}MB`}
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
            formatter={(value: number) => [`${value.toFixed(1)}MB`, 'Volume']}
          />
          <Bar
            dataKey="volume"
            fill="#8884d8"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}