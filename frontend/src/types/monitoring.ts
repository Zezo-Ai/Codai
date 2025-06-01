export interface ErrorRate {
  timestamp: string
  rate: number
}

export interface ResponseTime {
  timestamp: string
  time: number
}

export interface VolumeStats {
  category: string
  volume: number
  fileCount: number
}

export interface ErrorLog {
  id: string
  timestamp: string
  message: string
  component: string
  details: Record<string, any>
}

export interface MonitoringData {
  errorRates: ErrorRate[]
  responseTimes: ResponseTime[]
  volumeStats: VolumeStats[]
  recentErrors: ErrorLog[]
}

export interface Alert {
  id: string
  type: 'error_rate' | 'response_time' | 'volume'
  severity: 'info' | 'warning' | 'error'
  message: string
  timestamp: string
  acknowledged: boolean
}

export type TimeRange = '1h' | '24h' | '7d' | '30d'

export interface MonitoringFilters {
  timeRange: TimeRange
  categories?: string[]
  severity?: ('info' | 'warning' | 'error')[]
}