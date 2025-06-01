import { EventEmitter } from 'events'

export interface ScrollEventData {
  id: string
  timestamp: number
  type: 'wheel' | 'touch' | 'keyboard' | 'programmatic' | 'auto'
  source: 'user' | 'auto' | 'system'
  scrollTop: number
  scrollLeft: number
  deltaY: number
  deltaX: number
  duration?: number
  interrupted: boolean
  completionRate: number
  velocity: number
  acceleration: number
  targetElement?: string
  preventDefault: boolean
  stopPropagation: boolean
}

export interface ScrollPattern {
  type: 'smooth' | 'instant' | 'momentum' | 'bounce'
  direction: 'up' | 'down' | 'both'
  frequency: number // Events per second
  consistency: number // 0-100 score
}

export interface ScrollSession {
  id: string
  startTime: number
  endTime?: number
  events: ScrollEventData[]
  pattern?: ScrollPattern
  totalDistance: number
  averageVelocity: number
  peakVelocity: number
  interruptions: number
}

export class ScrollEventTracker extends EventEmitter {
  private events: ScrollEventData[] = []
  private sessions: ScrollSession[] = []
  private currentSession: ScrollSession | null = null
  private lastEventTime: number = 0
  private sessionTimeout: number = 500 // ms
  private eventIdCounter: number = 0
  private performanceMarks: Map<string, number> = new Map()

  constructor(options?: {
    sessionTimeout?: number
    maxEvents?: number
    maxSessions?: number
  }) {
    super()
    
    if (options?.sessionTimeout) {
      this.sessionTimeout = options.sessionTimeout
    }
  }

  trackEvent(event: Event | CustomScrollEvent): ScrollEventData {
    const now = performance.now()
    const eventData = this.createEventData(event, now)
    
    // Store event
    this.events.push(eventData)
    this.pruneOldEvents()
    
    // Session management
    this.updateSession(eventData)
    
    // Emit event for real-time monitoring
    this.emit('scrollEvent', eventData)
    
    // Pattern detection
    if (this.events.length >= 10) {
      const pattern = this.detectPattern(this.events.slice(-10))
      if (pattern) {
        this.emit('patternDetected', pattern)
      }
    }
    
    this.lastEventTime = now
    return eventData
  }

  private createEventData(event: Event | CustomScrollEvent, timestamp: number): ScrollEventData {
    const target = event.target as HTMLElement
    const isCustom = 'scrollTop' in event
    
    let scrollTop = 0, scrollLeft = 0, deltaY = 0, deltaX = 0
    
    if (isCustom) {
      const customEvent = event as CustomScrollEvent
      scrollTop = customEvent.scrollTop
      scrollLeft = customEvent.scrollLeft || 0
      deltaY = customEvent.deltaY
      deltaX = customEvent.deltaX || 0
    } else if (target) {
      scrollTop = target.scrollTop
      scrollLeft = target.scrollLeft
      
      if (event.type === 'wheel') {
        const wheelEvent = event as WheelEvent
        deltaY = wheelEvent.deltaY
        deltaX = wheelEvent.deltaX
      }
    }
    
    // Calculate velocity and acceleration
    const lastEvent = this.events[this.events.length - 1]
    const timeDelta = lastEvent ? timestamp - lastEvent.timestamp : 0
    const velocity = timeDelta > 0 ? deltaY / timeDelta : 0
    const acceleration = lastEvent && timeDelta > 0 
      ? (velocity - lastEvent.velocity) / timeDelta 
      : 0
    
    return {
      id: `scroll-${++this.eventIdCounter}`,
      timestamp,
      type: this.getEventType(event),
      source: this.getEventSource(event),
      scrollTop,
      scrollLeft,
      deltaY,
      deltaX,
      interrupted: false,
      completionRate: 100,
      velocity,
      acceleration,
      targetElement: target?.className || target?.tagName,
      preventDefault: event.defaultPrevented || false,
      stopPropagation: event.cancelBubble || false
    }
  }

  private getEventType(event: Event | CustomScrollEvent): ScrollEventData['type'] {
    if ('type' in event) {
      switch (event.type) {
        case 'wheel': return 'wheel'
        case 'touchmove':
        case 'touchstart':
        case 'touchend': return 'touch'
        case 'keydown':
        case 'keyup': return 'keyboard'
        default: return 'programmatic'
      }
    }
    return (event as CustomScrollEvent).source === 'auto' ? 'auto' : 'programmatic'
  }

  private getEventSource(event: Event | CustomScrollEvent): ScrollEventData['source'] {
    if ('isTrusted' in event && event.isTrusted) return 'user'
    if ('source' in event) return (event as CustomScrollEvent).source
    return 'system'
  }

  private updateSession(eventData: ScrollEventData) {
    const now = eventData.timestamp
    
    // Check if we need a new session
    if (!this.currentSession || now - this.lastEventTime > this.sessionTimeout) {
      // Finalize previous session
      if (this.currentSession) {
        this.finalizeSession(this.currentSession)
      }
      
      // Start new session
      this.currentSession = {
        id: `session-${Date.now()}`,
        startTime: now,
        events: [eventData],
        totalDistance: Math.abs(eventData.deltaY),
        averageVelocity: Math.abs(eventData.velocity),
        peakVelocity: Math.abs(eventData.velocity),
        interruptions: 0
      }
      
      this.emit('sessionStart', this.currentSession)
    } else {
      // Update current session
      this.currentSession.events.push(eventData)
      this.currentSession.totalDistance += Math.abs(eventData.deltaY)
      this.currentSession.peakVelocity = Math.max(
        this.currentSession.peakVelocity,
        Math.abs(eventData.velocity)
      )
      
      // Check for interruptions
      if (this.isInterruption(eventData)) {
        this.currentSession.interruptions++
        eventData.interrupted = true
      }
    }
  }

  private isInterruption(event: ScrollEventData): boolean {
    if (this.currentSession && this.currentSession.events.length > 1) {
      const prevEvent = this.currentSession.events[this.currentSession.events.length - 2]
      
      // Sudden direction change
      if (Math.sign(event.deltaY) !== Math.sign(prevEvent.deltaY) && 
          Math.abs(event.deltaY) > 10) {
        return true
      }
      
      // Sudden velocity change
      if (Math.abs(event.velocity - prevEvent.velocity) > prevEvent.velocity * 2) {
        return true
      }
    }
    
    return false
  }

  private finalizeSession(session: ScrollSession) {
    session.endTime = performance.now()
    
    // Calculate average velocity
    const velocities = session.events.map(e => Math.abs(e.velocity))
    session.averageVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length
    
    // Detect pattern
    session.pattern = this.detectPattern(session.events)
    
    this.sessions.push(session)
    this.emit('sessionEnd', session)
    
    // Prune old sessions
    if (this.sessions.length > 100) {
      this.sessions = this.sessions.slice(-50)
    }
  }

  private detectPattern(events: ScrollEventData[]): ScrollPattern | undefined {
    if (events.length < 3) return undefined
    
    const directions = events.map(e => Math.sign(e.deltaY))
    const velocities = events.map(e => Math.abs(e.velocity))
    const timeDiffs = events.slice(1).map((e, i) => e.timestamp - events[i].timestamp)
    
    // Determine primary direction
    const upCount = directions.filter(d => d < 0).length
    const downCount = directions.filter(d => d > 0).length
    const direction: ScrollPattern['direction'] = 
      upCount > downCount * 1.5 ? 'up' :
      downCount > upCount * 1.5 ? 'down' : 'both'
    
    // Calculate frequency
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length
    const frequency = avgTimeDiff > 0 ? 1000 / avgTimeDiff : 0
    
    // Calculate consistency
    const velocityVariance = this.calculateVariance(velocities)
    const consistency = Math.max(0, 100 - velocityVariance * 10)
    
    // Determine type
    let type: ScrollPattern['type'] = 'smooth'
    if (velocities.some(v => v > 1000)) {
      type = 'instant'
    } else if (this.hasMomentumPattern(events)) {
      type = 'momentum'
    } else if (this.hasBouncePattern(events)) {
      type = 'bounce'
    }
    
    return { type, direction, frequency, consistency }
  }

  private hasMomentumPattern(events: ScrollEventData[]): boolean {
    // Momentum pattern: decreasing velocity over time
    const velocities = events.map(e => Math.abs(e.velocity))
    let decreasingCount = 0
    
    for (let i = 1; i < velocities.length; i++) {
      if (velocities[i] < velocities[i - 1] * 0.9) {
        decreasingCount++
      }
    }
    
    return decreasingCount > velocities.length * 0.7
  }

  private hasBouncePattern(events: ScrollEventData[]): boolean {
    // Bounce pattern: direction changes at boundaries
    const directions = events.map(e => Math.sign(e.deltaY))
    let changeCount = 0
    
    for (let i = 1; i < directions.length; i++) {
      if (directions[i] !== directions[i - 1] && directions[i] !== 0) {
        changeCount++
      }
    }
    
    return changeCount >= 2 && events.length < 10
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length)
  }

  private pruneOldEvents() {
    const maxAge = 60000 // 1 minute
    const now = performance.now()
    this.events = this.events.filter(e => now - e.timestamp < maxAge)
  }

  // Analysis methods
  getRecentEvents(count: number = 10): ScrollEventData[] {
    return this.events.slice(-count)
  }

  getCurrentSession(): ScrollSession | null {
    return this.currentSession
  }

  getSessionStats(): {
    totalSessions: number
    averageSessionDuration: number
    averageEventsPerSession: number
    mostCommonPattern: ScrollPattern['type'] | null
  } {
    if (this.sessions.length === 0) {
      return {
        totalSessions: 0,
        averageSessionDuration: 0,
        averageEventsPerSession: 0,
        mostCommonPattern: null
      }
    }
    
    const durations = this.sessions
      .filter(s => s.endTime)
      .map(s => (s.endTime! - s.startTime) / 1000)
    
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0
    
    const avgEvents = this.sessions
      .map(s => s.events.length)
      .reduce((a, b) => a + b, 0) / this.sessions.length
    
    // Find most common pattern
    const patternCounts = new Map<ScrollPattern['type'], number>()
    this.sessions.forEach(s => {
      if (s.pattern) {
        patternCounts.set(s.pattern.type, (patternCounts.get(s.pattern.type) || 0) + 1)
      }
    })
    
    let mostCommonPattern: ScrollPattern['type'] | null = null
    let maxCount = 0
    patternCounts.forEach((count, pattern) => {
      if (count > maxCount) {
        maxCount = count
        mostCommonPattern = pattern
      }
    })
    
    return {
      totalSessions: this.sessions.length,
      averageSessionDuration: avgDuration,
      averageEventsPerSession: avgEvents,
      mostCommonPattern
    }
  }

  // Performance tracking
  startPerformanceMeasure(label: string) {
    this.performanceMarks.set(label, performance.now())
  }

  endPerformanceMeasure(label: string): number | null {
    const start = this.performanceMarks.get(label)
    if (!start) return null
    
    const duration = performance.now() - start
    this.performanceMarks.delete(label)
    
    this.emit('performanceMeasure', { label, duration })
    return duration
  }

  reset() {
    this.events = []
    this.sessions = []
    this.currentSession = null
    this.lastEventTime = 0
    this.eventIdCounter = 0
    this.performanceMarks.clear()
  }
}

// Custom event interface for programmatic scrolls
export interface CustomScrollEvent {
  scrollTop: number
  scrollLeft?: number
  deltaY: number
  deltaX?: number
  source: 'auto' | 'system'
}