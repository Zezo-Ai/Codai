'use client'

import { analytics } from './analytics'
import type { Message } from '@/components/chat/types'

interface RecoveryEvent {
  type: 'attempt' | 'success' | 'failure' | 'fallback'
  source: 'indexeddb' | 'localstorage' | 'backup'
  timestamp: string
  sessionId: string
  component?: string
  details: Record<string, any>
}

interface ComponentMetrics {
  attempts: number
  successes: number
  failures: number
  errorTypes: Record<string, number>
  recoveryStrategies: Record<string, number>
  averageTime: number
}

interface ErrorEntry {
  type: string
  count: number
}

interface TransformedMetrics {
  recoverySuccessRate: number
  successfulRecoveries: number
  failedRecoveries: number
  averageRecoveryTime: number
  totalAttempts: number
  componentStats: Record<string, {
    attempts: number
    successes: number
    failures: number
  }>
  commonErrors: ErrorEntry[]
}

interface RecoveryMetricsData {
  componentMetrics: Record<string, ComponentMetrics>
  errorTypes: Record<string, number>
  averageTime: number
}

const isClient = typeof window !== 'undefined'

class RecoveryAnalytics {
  private static instance: RecoveryAnalytics
  private readonly CATEGORY = 'recovery'
  private readonly STORAGE_VERSION = '2.1.0'

  private metricsData: RecoveryMetricsData = {
    componentMetrics: {},
    errorTypes: {},
    averageTime: 0
  }

  private constructor() {
    if (isClient) {
      this.loadMetricsData()
    }
  }

  public static getInstance(): RecoveryAnalytics {
    if (!RecoveryAnalytics.instance) {
      RecoveryAnalytics.instance = new RecoveryAnalytics()
    }
    return RecoveryAnalytics.instance
  }

  public trackRecoveryAttempt(
    sessionId: string, 
    source: RecoveryEvent['source'],
    component?: string
  ): string {
    const timestamp = new Date().toISOString()
    
    analytics.trackEvent(this.CATEGORY, 'attempt', {
      sessionId,
      source,
      component,
      timestamp
    })

    analytics.updateMetrics(this.CATEGORY, {
      total: analytics.getMetrics(this.CATEGORY).total + 1
    })

    if (component) {
      this.updateComponentMetrics(component, 'attempts')
    }

    this.persistMetricsData()
    return timestamp
  }

  public trackRecoverySuccess(
    sessionId: string,
    source: RecoveryEvent['source'],
    startTime: string,
    messages: Message[],
    component?: string
  ): void {
    const endTime = new Date().toISOString()
    const recoveryTime = new Date(endTime).getTime() - new Date(startTime).getTime()

    analytics.trackEvent(this.CATEGORY, 'success', {
      sessionId,
      source,
      component,
      recoveryTime,
      messagesCount: messages.length
    })

    analytics.updateMetrics(this.CATEGORY, {
      successful: analytics.getMetrics(this.CATEGORY).successful + 1
    })

    this.updateAverageRecoveryTime(recoveryTime)

    if (component) {
      this.updateComponentMetrics(component, 'successes', recoveryTime)
    }

    this.persistMetricsData()
  }

  public trackRecoveryFailure(
    sessionId: string,
    source: RecoveryEvent['source'],
    error: Error,
    component?: string
  ): void {
    analytics.trackEvent(this.CATEGORY, 'failure', {
      sessionId,
      source,
      component,
      error: error.message,
      errorName: error.name
    })

    analytics.updateMetrics(this.CATEGORY, {
      failed: analytics.getMetrics(this.CATEGORY).failed + 1
    })

    this.metricsData.errorTypes[error.name] = 
      (this.metricsData.errorTypes[error.name] || 0) + 1

    if (component) {
      this.updateComponentMetrics(component, 'failures')
      if (!this.metricsData.componentMetrics[component].errorTypes[error.name]) {
        this.metricsData.componentMetrics[component].errorTypes[error.name] = 0
      }
      this.metricsData.componentMetrics[component].errorTypes[error.name]++
    }

    this.persistMetricsData()
  }

  public getMetrics(): TransformedMetrics {
    const baseMetrics = analytics.getMetrics(this.CATEGORY)

    const componentStats: Record<string, any> = {}
    Object.entries(this.metricsData.componentMetrics).forEach(([component, metrics]) => {
      componentStats[component] = {
        attempts: metrics.attempts,
        successes: metrics.successes,
        failures: metrics.failures
      }
    })

    const commonErrors: ErrorEntry[] = Object.entries(this.metricsData.errorTypes)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      recoverySuccessRate: baseMetrics.successRate,
      successfulRecoveries: baseMetrics.successful,
      failedRecoveries: baseMetrics.failed,
      averageRecoveryTime: this.metricsData.averageTime,
      totalAttempts: baseMetrics.total,
      componentStats,
      commonErrors
    }
  }

  public getComponentMetrics(component: string): ComponentMetrics | null {
    return this.metricsData.componentMetrics[component] || null
  }

  private updateComponentMetrics(
    component: string,
    type: 'attempts' | 'successes' | 'failures',
    recoveryTime?: number
  ): void {
    if (!this.metricsData.componentMetrics[component]) {
      this.metricsData.componentMetrics[component] = {
        attempts: 0,
        successes: 0,
        failures: 0,
        errorTypes: {},
        recoveryStrategies: {},
        averageTime: 0
      }
    }

    const metrics = this.metricsData.componentMetrics[component]
    metrics[type]++

    if (type === 'successes' && recoveryTime !== undefined) {
      const totalTime = metrics.averageTime * (metrics.successes - 1)
      metrics.averageTime = (totalTime + recoveryTime) / metrics.successes
    }
  }

  private updateAverageRecoveryTime(newTime: number): void {
    const baseMetrics = analytics.getMetrics(this.CATEGORY)
    const totalTime = this.metricsData.averageTime * (baseMetrics.successful - 1)
    this.metricsData.averageTime = (totalTime + newTime) / baseMetrics.successful
  }

  private persistMetricsData(): void {
    if (!isClient) return

    try {
      localStorage.setItem('recovery_metrics_data', JSON.stringify({
        version: this.STORAGE_VERSION,
        data: this.metricsData
      }))
    } catch (error) {
      // Silently handle error
    }
  }

  private loadMetricsData(): void {
    if (!isClient) return

    try {
      const stored = localStorage.getItem('recovery_metrics_data')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.version === this.STORAGE_VERSION) {
          this.metricsData = parsed.data
        }
      }
    } catch (error) {
      // Silently handle error
    }
  }
}

export const recoveryAnalytics = RecoveryAnalytics.getInstance()

export function useRecoveryAnalytics() {
  const trackAttempt = (
    sessionId: string, 
    source: RecoveryEvent['source'],
    component?: string
  ) => {
    return recoveryAnalytics.trackRecoveryAttempt(sessionId, source, component)
  }

  const trackSuccess = (
    sessionId: string,
    source: RecoveryEvent['source'],
    startTime: string,
    messages: Message[],
    component?: string
  ) => {
    recoveryAnalytics.trackRecoverySuccess(sessionId, source, startTime, messages, component)
  }

  const trackFailure = (
    sessionId: string,
    source: RecoveryEvent['source'],
    error: Error,
    component?: string
  ) => {
    recoveryAnalytics.trackRecoveryFailure(sessionId, source, error, component)
  }

  const getMetrics = () => {
    return recoveryAnalytics.getMetrics()
  }

  const getComponentMetrics = (component: string) => {
    return recoveryAnalytics.getComponentMetrics(component)
  }

  return {
    trackAttempt,
    trackSuccess,
    trackFailure,
    getMetrics,
    getComponentMetrics
  }
}