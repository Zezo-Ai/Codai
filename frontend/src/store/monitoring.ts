import { create } from 'zustand'

interface ErrorRate {
  timestamp: string
  rate: number
}

interface ResponseTime {
  timestamp: string
  time: number
}

interface VolumeStats {
  category: string
  volume: number
  fileCount: number
}

interface ErrorLog {
  id: string
  timestamp: string
  message: string
  component: string
  details: Record<string, any>
}

interface MonitoringState {
  errorRates: ErrorRate[]
  responseTimes: ResponseTime[]
  volumeStats: VolumeStats[]
  recentErrors: ErrorLog[]
  isLoading: boolean
  error: string | null
  fetchData: () => Promise<void>
}

export const useMonitoringStore = create<MonitoringState>((set) => ({
  errorRates: [],
  responseTimes: [],
  volumeStats: [],
  recentErrors: [],
  isLoading: false,
  error: null,

  fetchData: async () => {
    set({ isLoading: true })
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'}/api/monitoring/overview`)
      if (!response.ok) {
        throw new Error('Failed to fetch monitoring data')
      }
      const data = await response.json()
      set({
        errorRates: data.errorRates,
        responseTimes: data.responseTimes,
        volumeStats: data.volumeStats,
        recentErrors: data.recentErrors,
        error: null
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      set({ isLoading: false })
    }
  }
}))