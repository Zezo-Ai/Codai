interface AnalyticsEvent {
  category: string
  action: string
  timestamp: string
  metadata?: Record<string, any>
}

interface AnalyticsMetrics<T = any> {
  total: number
  successful: number
  failed: number
  successRate: number
  metadata?: T
}

class Analytics {
  private static instance: Analytics
  private readonly STORAGE_VERSION = '2.0.0'
  private readonly MAX_EVENTS = 1000

  private events: Record<string, AnalyticsEvent[]> = {}
  private metrics: Record<string, AnalyticsMetrics> = {}

  private constructor() {
    if (typeof window !== 'undefined') {
      this.loadFromStorage()
    }
  }

  static getInstance(): Analytics {
    if (!Analytics.instance) {
      Analytics.instance = new Analytics()
    }
    return Analytics.instance
  }

  trackEvent(
    category: string,
    action: string,
    metadata?: Record<string, any>
  ): void {
    const event: AnalyticsEvent = {
      category,
      action,
      timestamp: new Date().toISOString(),
      metadata
    }

    if (!this.events[category]) {
      this.events[category] = []
    }

    this.events[category].push(event)
    this.trimEvents(category)
    this.persistToStorage()
  }

  updateMetrics<T>(
    category: string,
    metrics: Partial<AnalyticsMetrics<T>>
  ): void {
    if (!this.metrics[category]) {
      this.metrics[category] = {
        total: 0,
        successful: 0,
        failed: 0,
        successRate: 0
      }
    }

    Object.assign(this.metrics[category], metrics)
    
    // Recalculate success rate
    if (this.metrics[category].total > 0) {
      this.metrics[category].successRate = 
        (this.metrics[category].successful / this.metrics[category].total) * 100
    }

    this.persistToStorage()
  }

  getMetrics<T>(category: string): AnalyticsMetrics<T> {
    return this.metrics[category] || {
      total: 0,
      successful: 0,
      failed: 0,
      successRate: 0
    }
  }

  getEvents(
    category: string,
    limit?: number
  ): AnalyticsEvent[] {
    const events = this.events[category] || []
    return limit ? events.slice(-limit) : events
  }

  clearCategory(category: string): void {
    delete this.events[category]
    delete this.metrics[category]
    this.persistToStorage()
  }

  private trimEvents(category: string): void {
    if (this.events[category].length > this.MAX_EVENTS) {
      this.events[category] = this.events[category].slice(-this.MAX_EVENTS)
    }
  }

  private persistToStorage(): void {
    try {
      localStorage.setItem('analytics_data', JSON.stringify({
        version: this.STORAGE_VERSION,
        events: this.events,
        metrics: this.metrics
      }))
    } catch (error) {
      console.error('Failed to persist analytics:', error)
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('analytics_data')
      if (stored) {
        const data = JSON.parse(stored)
        if (data.version === this.STORAGE_VERSION) {
          this.events = data.events
          this.metrics = data.metrics
        }
      }
    } catch (error) {
      console.error('Failed to load analytics:', error)
    }
  }
}

export const analytics = Analytics.getInstance()