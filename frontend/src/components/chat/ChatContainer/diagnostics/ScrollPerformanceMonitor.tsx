import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface PerformanceMetrics {
  fps: number
  scrollLatency: number
  eventHandlerTime: number
  domMutations: number
  memoryUsage: number
  reflows: number
  repaints: number
  jankScore: number
  smoothnessScore: number
  lastScrollTime: number
  scrollVelocity: number
  scrollAcceleration: number
}

interface ScrollEvent {
  timestamp: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  deltaY: number
  source: 'user' | 'programmatic' | 'auto'
  duration?: number
}

interface PerformanceReport {
  averageFps: number
  maxLatency: number
  totalJank: number
  smoothnessPercentage: number
  memoryPeakMB: number
  totalReflows: number
  totalRepaints: number
  scrollEvents: ScrollEvent[]
  bottlenecks: string[]
  recommendations: string[]
}

export const ScrollPerformanceMonitor: React.FC<{
  containerRef: React.RefObject<HTMLElement>
  enabled?: boolean
  onReport?: (report: PerformanceReport) => void
  showOverlay?: boolean
}> = ({ containerRef, enabled = true, onReport, showOverlay = true }) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    scrollLatency: 0,
    eventHandlerTime: 0,
    domMutations: 0,
    memoryUsage: 0,
    reflows: 0,
    repaints: 0,
    jankScore: 0,
    smoothnessScore: 100,
    lastScrollTime: 0,
    scrollVelocity: 0,
    scrollAcceleration: 0
  })

  const [isRecording, setIsRecording] = useState(false)
  const [scrollEvents, setScrollEvents] = useState<ScrollEvent[]>([])
  
  const frameTimesRef = useRef<number[]>([])
  const lastFrameTimeRef = useRef(performance.now())
  const mutationObserverRef = useRef<MutationObserver | null>(null)
  const performanceObserverRef = useRef<PerformanceObserver | null>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastScrollPositionRef = useRef(0)
  const scrollStartTimeRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)

  // FPS Measurement
  const measureFPS = useCallback(() => {
    const now = performance.now()
    const delta = now - lastFrameTimeRef.current
    lastFrameTimeRef.current = now

    frameTimesRef.current.push(delta)
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift()
    }

    const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
    const fps = Math.round(1000 / avgFrameTime)

    setMetrics(prev => ({ ...prev, fps }))

    if (enabled) {
      rafIdRef.current = requestAnimationFrame(measureFPS)
    }
  }, [enabled])

  // Scroll performance measurement
  const handleScroll = useCallback((e: Event) => {
    if (!containerRef.current) return

    const startTime = performance.now()
    const container = containerRef.current
    const scrollTop = container.scrollTop
    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight

    // Detect scroll source
    const isUserScroll = e.isTrusted
    const deltaY = scrollTop - lastScrollPositionRef.current
    
    // Calculate velocity and acceleration
    const timeDelta = startTime - metrics.lastScrollTime
    const velocity = timeDelta > 0 ? deltaY / timeDelta : 0
    const acceleration = timeDelta > 0 ? (velocity - metrics.scrollVelocity) / timeDelta : 0

    // Record scroll event
    const scrollEvent: ScrollEvent = {
      timestamp: startTime,
      scrollTop,
      scrollHeight,
      clientHeight,
      deltaY,
      source: isUserScroll ? 'user' : 'programmatic'
    }

    setScrollEvents(prev => [...prev.slice(-99), scrollEvent])

    // Update metrics
    setMetrics(prev => ({
      ...prev,
      lastScrollTime: startTime,
      scrollVelocity: velocity,
      scrollAcceleration: acceleration,
      eventHandlerTime: performance.now() - startTime
    }))

    lastScrollPositionRef.current = scrollTop

    // Detect scroll end
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      const duration = performance.now() - scrollStartTimeRef.current
      scrollEvent.duration = duration
      
      // Calculate jank and smoothness
      const jankScore = calculateJankScore(frameTimesRef.current)
      const smoothnessScore = calculateSmoothnessScore(velocity, acceleration)
      
      setMetrics(prev => ({
        ...prev,
        jankScore,
        smoothnessScore
      }))
    }, 150)

    if (!scrollStartTimeRef.current) {
      scrollStartTimeRef.current = startTime
    }
  }, [containerRef, metrics.lastScrollTime, metrics.scrollVelocity])

  // DOM Mutation observer
  useEffect(() => {
    if (!enabled || !containerRef.current) return

    mutationObserverRef.current = new MutationObserver((mutations) => {
      const mutationCount = mutations.length
      setMetrics(prev => ({ ...prev, domMutations: prev.domMutations + mutationCount }))
    })

    mutationObserverRef.current.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    return () => {
      mutationObserverRef.current?.disconnect()
    }
  }, [enabled, containerRef])

  // Performance observer for reflows/repaints
  useEffect(() => {
    if (!enabled || !window.PerformanceObserver) return

    try {
      performanceObserverRef.current = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure' || entry.entryType === 'layout-shift') {
            setMetrics(prev => ({ ...prev, reflows: prev.reflows + 1 }))
          }
        }
      })

      performanceObserverRef.current.observe({ 
        entryTypes: ['measure', 'layout-shift'] 
      })
    } catch (error) {
      console.warn('Performance Observer not fully supported:', error)
    }

    return () => {
      performanceObserverRef.current?.disconnect()
    }
  }, [enabled])

  // Memory monitoring
  useEffect(() => {
    if (!enabled) return

    const measureMemory = () => {
      if ('memory' in performance && (performance as any).memory) {
        const memoryInfo = (performance as any).memory
        const usedMB = memoryInfo.usedJSHeapSize / 1048576
        setMetrics(prev => ({ ...prev, memoryUsage: usedMB }))
      }
    }

    const intervalId = setInterval(measureMemory, 1000)
    return () => clearInterval(intervalId)
  }, [enabled])

  // Start/stop FPS measurement
  useEffect(() => {
    if (enabled) {
      measureFPS()
    } else if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [enabled, measureFPS])

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [containerRef, enabled, handleScroll])

  // Generate performance report
  const generateReport = useCallback((): PerformanceReport => {
    const averageFps = frameTimesRef.current.length > 0
      ? Math.round(1000 / (frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length))
      : 60

    const maxLatency = Math.max(...scrollEvents.map(e => e.duration || 0))
    const totalJank = metrics.jankScore
    const smoothnessPercentage = metrics.smoothnessScore
    
    const bottlenecks: string[] = []
    const recommendations: string[] = []

    // Identify bottlenecks
    if (averageFps < 30) {
      bottlenecks.push('Low FPS detected')
      recommendations.push('Reduce DOM complexity or optimize render methods')
    }
    
    if (metrics.domMutations > 100) {
      bottlenecks.push('Excessive DOM mutations')
      recommendations.push('Batch DOM updates or use virtual scrolling')
    }
    
    if (metrics.eventHandlerTime > 16) {
      bottlenecks.push('Slow scroll event handlers')
      recommendations.push('Optimize scroll event handlers or use passive listeners')
    }
    
    if (metrics.memoryUsage > 100) {
      bottlenecks.push('High memory usage')
      recommendations.push('Implement content virtualization or cleanup unused elements')
    }

    return {
      averageFps,
      maxLatency,
      totalJank,
      smoothnessPercentage,
      memoryPeakMB: metrics.memoryUsage,
      totalReflows: metrics.reflows,
      totalRepaints: metrics.repaints,
      scrollEvents,
      bottlenecks,
      recommendations
    }
  }, [metrics, scrollEvents])

  // Recording controls
  const startRecording = useCallback(() => {
    setIsRecording(true)
    setScrollEvents([])
    setMetrics(prev => ({
      ...prev,
      domMutations: 0,
      reflows: 0,
      repaints: 0
    }))
    frameTimesRef.current = []
  }, [])

  const stopRecording = useCallback(() => {
    setIsRecording(false)
    const report = generateReport()
    onReport?.(report)
  }, [generateReport, onReport])

  if (!showOverlay) return null

  return (
    <AnimatePresence>
      {enabled && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 right-4 bg-black/90 text-white p-4 rounded-lg shadow-lg font-mono text-xs z-50"
          style={{ minWidth: '300px' }}
        >
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold">Scroll Performance</h3>
              <div className="flex gap-2">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="px-2 py-1 bg-green-600 rounded text-xs hover:bg-green-700"
                  >
                    Record
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MetricDisplay
                label="FPS"
                value={metrics.fps}
                unit=""
                warning={metrics.fps < 30}
                danger={metrics.fps < 20}
              />
              <MetricDisplay
                label="Latency"
                value={metrics.scrollLatency.toFixed(1)}
                unit="ms"
                warning={metrics.scrollLatency > 16}
                danger={metrics.scrollLatency > 33}
              />
              <MetricDisplay
                label="DOM Mutations"
                value={metrics.domMutations}
                unit=""
                warning={metrics.domMutations > 50}
                danger={metrics.domMutations > 100}
              />
              <MetricDisplay
                label="Memory"
                value={metrics.memoryUsage.toFixed(1)}
                unit="MB"
                warning={metrics.memoryUsage > 50}
                danger={metrics.memoryUsage > 100}
              />
              <MetricDisplay
                label="Jank Score"
                value={metrics.jankScore.toFixed(1)}
                unit="%"
                warning={metrics.jankScore > 10}
                danger={metrics.jankScore > 20}
              />
              <MetricDisplay
                label="Smoothness"
                value={metrics.smoothnessScore.toFixed(1)}
                unit="%"
                warning={metrics.smoothnessScore < 80}
                danger={metrics.smoothnessScore < 60}
                invert
              />
            </div>

            {isRecording && (
              <div className="mt-2 text-xs text-red-400">
                Recording... {scrollEvents.length} events
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const MetricDisplay: React.FC<{
  label: string
  value: string | number
  unit: string
  warning?: boolean
  danger?: boolean
  invert?: boolean
}> = ({ label, value, unit, warning, danger, invert }) => {
  const colorClass = danger ? 'text-red-400' : warning ? 'text-yellow-400' : 'text-green-400'
  
  return (
    <div className="flex flex-col">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className={`text-sm font-semibold ${colorClass}`}>
        {value}{unit}
      </span>
    </div>
  )
}

// Utility functions
function calculateJankScore(frameTimes: number[]): number {
  if (frameTimes.length === 0) return 0
  
  const targetFrameTime = 16.67 // 60 FPS
  const jankFrames = frameTimes.filter(time => time > targetFrameTime * 1.5).length
  
  return (jankFrames / frameTimes.length) * 100
}

function calculateSmoothnessScore(velocity: number, acceleration: number): number {
  // Lower acceleration = smoother scroll
  const accelerationPenalty = Math.min(Math.abs(acceleration) * 10, 50)
  
  // Consistent velocity = smoother scroll
  const velocityConsistency = Math.max(0, 100 - Math.abs(velocity) * 0.1)
  
  return Math.max(0, velocityConsistency - accelerationPenalty)
}