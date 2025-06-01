import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RaceConditionDetector, AutoTracker } from './RaceConditionDetector'
import { ScrollEventTracker } from './ScrollEventTracker'

interface DiagnosticData {
  scrollPosition: number
  scrollVelocity: number
  scrollAcceleration: number
  activeHandlers: string[]
  pendingOperations: string[]
  memoryPressure: 'low' | 'medium' | 'high'
  performanceWarnings: string[]
  lastFrameTime: number
  frameRate: number
  eventQueueSize: number
  raceConditions: number
}

interface ScrollDebugOverlayProps {
  enabled: boolean
  containerRef: React.RefObject<HTMLElement>
  verbose?: boolean
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export const ScrollDebugOverlay: React.FC<ScrollDebugOverlayProps> = ({
  enabled,
  containerRef,
  verbose = false,
  position = 'bottom-left'
}) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticData>({
    scrollPosition: 0,
    scrollVelocity: 0,
    scrollAcceleration: 0,
    activeHandlers: [],
    pendingOperations: [],
    memoryPressure: 'low',
    performanceWarnings: [],
    lastFrameTime: 0,
    frameRate: 60,
    eventQueueSize: 0,
    raceConditions: 0
  })

  const [eventLog, setEventLog] = useState<Array<{
    timestamp: number
    type: string
    details: string
  }>>([])

  const raceDetectorRef = useRef(new RaceConditionDetector())
  const eventTrackerRef = useRef(new ScrollEventTracker())
  const autoTrackerRef = useRef(new AutoTracker(raceDetectorRef.current))
  const frameTimesRef = useRef<number[]>([])
  const lastScrollPosRef = useRef(0)
  const lastScrollTimeRef = useRef(0)
  const activeHandlersRef = useRef(new Set<string>())
  const pendingOpsRef = useRef(new Set<string>())

  // Position styles
  const positionStyles = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  }

  useEffect(() => {
    if (!enabled || !containerRef.current) return

    const container = containerRef.current
    const raceDetector = raceDetectorRef.current
    const eventTracker = eventTrackerRef.current
    const autoTracker = autoTrackerRef.current

    // Frame rate monitoring
    let animationFrameId: number
    const measureFrameRate = () => {
      const now = performance.now()
      frameTimesRef.current.push(now)
      
      // Keep last 60 frames
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift()
      }
      
      // Calculate FPS
      if (frameTimesRef.current.length > 1) {
        const totalTime = now - frameTimesRef.current[0]
        const frameRate = (frameTimesRef.current.length - 1) / (totalTime / 1000)
        
        setDiagnostics(prev => ({
          ...prev,
          frameRate: Math.round(frameRate),
          lastFrameTime: now
        }))
      }
      
      animationFrameId = requestAnimationFrame(measureFrameRate)
    }

    // Event handlers with tracking
    const handlers = {
      scroll: (e: Event) => {
        const handlerId = raceDetector.trackOperationStart('scroll', {
          scrollTop: container.scrollTop,
          timeStamp: e.timeStamp
        })
        activeHandlersRef.current.add('scroll')
        
        const now = performance.now()
        const scrollPos = container.scrollTop
        const timeDelta = now - lastScrollTimeRef.current
        const posDelta = scrollPos - lastScrollPosRef.current
        
        const velocity = timeDelta > 0 ? posDelta / timeDelta : 0
        const prevVelocity = diagnostics.scrollVelocity
        const acceleration = timeDelta > 0 ? (velocity - prevVelocity) / timeDelta : 0
        
        eventTracker.trackEvent(e)
        
        setDiagnostics(prev => ({
          ...prev,
          scrollPosition: scrollPos,
          scrollVelocity: velocity,
          scrollAcceleration: acceleration,
          activeHandlers: Array.from(activeHandlersRef.current)
        }))
        
        lastScrollPosRef.current = scrollPos
        lastScrollTimeRef.current = now
        
        // Log event if verbose
        if (verbose) {
          logEvent('scroll', `pos: ${scrollPos.toFixed(0)}, vel: ${velocity.toFixed(2)}`)
        }
        
        setTimeout(() => {
          activeHandlersRef.current.delete('scroll')
          raceDetector.trackOperationEnd(handlerId)
          updateActiveHandlers()
        }, 0)
      },
      
      wheel: (e: WheelEvent) => {
        const handlerId = raceDetector.trackOperationStart('scroll', {
          deltaY: e.deltaY,
          deltaX: e.deltaX
        })
        activeHandlersRef.current.add('wheel')
        
        eventTracker.trackEvent(e)
        
        if (verbose) {
          logEvent('wheel', `deltaY: ${e.deltaY}, deltaX: ${e.deltaX}`)
        }
        
        setTimeout(() => {
          activeHandlersRef.current.delete('wheel')
          raceDetector.trackOperationEnd(handlerId)
          updateActiveHandlers()
        }, 0)
      },
      
      touchstart: (e: TouchEvent) => {
        activeHandlersRef.current.add('touch')
        if (verbose) {
          logEvent('touchstart', `touches: ${e.touches.length}`)
        }
        updateActiveHandlers()
      },
      
      touchmove: (e: TouchEvent) => {
        eventTracker.trackEvent(e)
        if (verbose && frameTimesRef.current.length % 10 === 0) {
          logEvent('touchmove', `touches: ${e.touches.length}`)
        }
      },
      
      touchend: (e: TouchEvent) => {
        activeHandlersRef.current.delete('touch')
        if (verbose) {
          logEvent('touchend', `touches: ${e.changedTouches.length}`)
        }
        updateActiveHandlers()
      },
      
      resize: () => {
        const handlerId = raceDetector.trackOperationStart('render', {
          width: container.clientWidth,
          height: container.clientHeight
        })
        pendingOpsRef.current.add('resize')
        
        if (verbose) {
          logEvent('resize', `${container.clientWidth}x${container.clientHeight}`)
        }
        
        setTimeout(() => {
          pendingOpsRef.current.delete('resize')
          raceDetector.trackOperationEnd(handlerId)
          updatePendingOps()
        }, 100)
      }
    }

    // Mutation observer for DOM changes
    const mutationObserver = new MutationObserver((mutations) => {
      const handlerId = raceDetector.trackOperationStart('dom-mutation', {
        mutationCount: mutations.length
      })
      pendingOpsRef.current.add('dom-mutation')
      
      if (verbose) {
        logEvent('mutation', `${mutations.length} changes`)
      }
      
      setTimeout(() => {
        pendingOpsRef.current.delete('dom-mutation')
        raceDetector.trackOperationEnd(handlerId)
        updatePendingOps()
      }, 0)
    })

    // Memory pressure monitoring
    const checkMemoryPressure = () => {
      if ('memory' in performance && (performance as any).memory) {
        const memory = (performance as any).memory
        const usedMB = memory.usedJSHeapSize / 1048576
        const limitMB = memory.jsHeapSizeLimit / 1048576
        const percentage = (usedMB / limitMB) * 100
        
        let pressure: DiagnosticData['memoryPressure'] = 'low'
        if (percentage > 80) pressure = 'high'
        else if (percentage > 60) pressure = 'medium'
        
        setDiagnostics(prev => ({ ...prev, memoryPressure: pressure }))
        
        if (pressure !== 'low') {
          addWarning(`Memory usage: ${usedMB.toFixed(1)}MB (${percentage.toFixed(1)}%)`)
        }
      }
    }

    // Performance monitoring
    const checkPerformance = () => {
      const report = raceDetector.generateReport()
      const stats = eventTracker.getSessionStats()
      
      setDiagnostics(prev => ({
        ...prev,
        raceConditions: report.overlaps.filter(o => o.severity === 'high').length,
        eventQueueSize: eventTracker.getRecentEvents().length
      }))
      
      // Check for performance issues
      if (report.score < 70) {
        addWarning(`Race condition score: ${report.score}/100`)
      }
      
      if (diagnostics.frameRate < 30) {
        addWarning(`Low frame rate: ${diagnostics.frameRate} FPS`)
      }
      
      if (stats.averageEventsPerSession > 100) {
        addWarning(`High event frequency: ${stats.averageEventsPerSession} events/session`)
      }
    }

    const updateActiveHandlers = () => {
      setDiagnostics(prev => ({
        ...prev,
        activeHandlers: Array.from(activeHandlersRef.current)
      }))
    }

    const updatePendingOps = () => {
      setDiagnostics(prev => ({
        ...prev,
        pendingOperations: Array.from(pendingOpsRef.current)
      }))
    }

    const addWarning = (warning: string) => {
      setDiagnostics(prev => ({
        ...prev,
        performanceWarnings: [...prev.performanceWarnings.slice(-4), warning]
      }))
    }

    const logEvent = (type: string, details: string) => {
      setEventLog(prev => [...prev.slice(-19), {
        timestamp: Date.now(),
        type,
        details
      }])
    }

    // Attach event listeners
    container.addEventListener('scroll', handlers.scroll, { passive: true })
    container.addEventListener('wheel', handlers.wheel, { passive: true })
    container.addEventListener('touchstart', handlers.touchstart, { passive: true })
    container.addEventListener('touchmove', handlers.touchmove, { passive: true })
    container.addEventListener('touchend', handlers.touchend, { passive: true })
    window.addEventListener('resize', handlers.resize)

    // Start observers
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    // Start monitoring
    measureFrameRate()
    const memoryInterval = setInterval(checkMemoryPressure, 2000)
    const performanceInterval = setInterval(checkPerformance, 1000)

    return () => {
      // Cleanup
      container.removeEventListener('scroll', handlers.scroll)
      container.removeEventListener('wheel', handlers.wheel)
      container.removeEventListener('touchstart', handlers.touchstart)
      container.removeEventListener('touchmove', handlers.touchmove)
      container.removeEventListener('touchend', handlers.touchend)
      window.removeEventListener('resize', handlers.resize)
      
      mutationObserver.disconnect()
      cancelAnimationFrame(animationFrameId)
      clearInterval(memoryInterval)
      clearInterval(performanceInterval)
      
      raceDetector.reset()
      eventTracker.reset()
    }
  }, [enabled, containerRef, verbose])

  const getMemoryColor = (pressure: DiagnosticData['memoryPressure']) => {
    switch (pressure) {
      case 'high': return 'red-500'
      case 'medium': return 'yellow-500'
      default: return 'green-500'
    }
  }

  const getFrameRateColor = (fps: number) => {
    if (fps >= 55) return 'text-green-500'
    if (fps >= 30) return 'text-yellow-500'
    return 'text-red-500'
  }

  if (!enabled) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`fixed ${positionStyles[position]} bg-black/90 text-white p-4 rounded-lg shadow-xl font-mono text-xs z-50 max-w-sm`}
      >
        <h4 className="text-sm font-bold mb-2 flex items-center justify-between">
          Scroll Diagnostics
          <span className={getFrameRateColor(diagnostics.frameRate)}>
            {diagnostics.frameRate} FPS
          </span>
        </h4>
        
        <div className="space-y-2">
          {/* Core metrics */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-400">Position:</span>
              <span className="ml-1">{diagnostics.scrollPosition.toFixed(0)}px</span>
            </div>
            <div>
              <span className="text-gray-400">Velocity:</span>
              <span className="ml-1">{diagnostics.scrollVelocity.toFixed(2)}px/ms</span>
            </div>
            <div>
              <span className="text-gray-400">Acceleration:</span>
              <span className="ml-1">{diagnostics.scrollAcceleration.toFixed(3)}</span>
            </div>
            <div>
              <span className="text-gray-400">Memory:</span>
              <span className={`ml-1 text-${getMemoryColor(diagnostics.memoryPressure)}`}>
                {diagnostics.memoryPressure}
              </span>
            </div>
          </div>
          
          {/* Active handlers */}
          {diagnostics.activeHandlers.length > 0 && (
            <div>
              <span className="text-gray-400">Active:</span>
              <span className="ml-1 text-blue-400">
                {diagnostics.activeHandlers.join(', ')}
              </span>
            </div>
          )}
          
          {/* Pending operations */}
          {diagnostics.pendingOperations.length > 0 && (
            <div>
              <span className="text-gray-400">Pending:</span>
              <span className="ml-1 text-yellow-400">
                {diagnostics.pendingOperations.join(', ')}
              </span>
            </div>
          )}
          
          {/* Race conditions */}
          {diagnostics.raceConditions > 0 && (
            <div className="text-red-400">
              ⚠️ {diagnostics.raceConditions} race conditions detected
            </div>
          )}
          
          {/* Warnings */}
          {diagnostics.performanceWarnings.length > 0 && (
            <div className="border-t border-gray-700 pt-2 mt-2">
              <div className="text-yellow-400 text-xs space-y-1">
                {diagnostics.performanceWarnings.map((warning, i) => (
                  <div key={i}>⚠️ {warning}</div>
                ))}
              </div>
            </div>
          )}
          
          {/* Verbose event log */}
          {verbose && eventLog.length > 0 && (
            <div className="border-t border-gray-700 pt-2 mt-2 max-h-32 overflow-y-auto">
              <div className="text-xs space-y-0.5">
                {eventLog.slice(-5).map((event, i) => (
                  <div key={i} className="flex gap-2 text-gray-400">
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                    <span className="text-blue-400">{event.type}</span>
                    <span className="text-gray-500">{event.details}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}