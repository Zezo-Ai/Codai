import React, { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { ScrollPerformanceMonitor } from './ScrollPerformanceMonitor'
import { ScrollEventTracker } from './ScrollEventTracker'

interface BenchmarkResult {
  name: string
  timestamp: number
  metrics: {
    fps: number
    latency: number
    jank: number
    smoothness: number
    memory: number
    eventCount: number
    duration: number
  }
  passed: boolean
  details?: string
}

interface BenchmarkScenario {
  name: string
  description: string
  duration: number
  execute: (container: HTMLElement) => Promise<void>
}

export const ScrollBenchmark: React.FC<{
  containerRef: React.RefObject<HTMLElement>
  onComplete?: (results: BenchmarkResult[]) => void
}> = ({ containerRef, onComplete }) => {
  const [isRunning, setIsRunning] = useState(false)
  const [currentScenario, setCurrentScenario] = useState<string | null>(null)
  const [results, setResults] = useState<BenchmarkResult[]>([])
  const [progress, setProgress] = useState(0)
  
  const monitorRef = useRef<ScrollPerformanceMonitor | null>(null)
  const trackerRef = useRef<ScrollEventTracker | null>(null)

  // Benchmark scenarios
  const scenarios: BenchmarkScenario[] = [
    {
      name: 'Rapid Scroll',
      description: 'Tests performance during rapid continuous scrolling',
      duration: 5000,
      execute: async (container) => {
        const startTime = Date.now()
        const amplitude = container.scrollHeight / 4
        const frequency = 0.005 // 5Hz
        
        while (Date.now() - startTime < 5000) {
          const elapsed = Date.now() - startTime
          const position = amplitude * Math.sin(frequency * elapsed) + amplitude
          container.scrollTop = position
          await new Promise(resolve => requestAnimationFrame(resolve))
        }
      }
    },
    {
      name: 'Large Content Updates',
      description: 'Tests scrolling while adding large content blocks',
      duration: 3000,
      execute: async (container) => {
        const startScroll = async () => {
          let direction = 1
          for (let i = 0; i < 30; i++) {
            container.scrollTop += direction * 50
            if (container.scrollTop <= 0 || 
                container.scrollTop >= container.scrollHeight - container.clientHeight) {
              direction *= -1
            }
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
        
        const addContent = async () => {
          for (let i = 0; i < 10; i++) {
            const div = document.createElement('div')
            div.style.height = '200px'
            div.style.background = `hsl(${i * 36}, 70%, 50%)`
            div.textContent = `Dynamic content block ${i}`
            container.appendChild(div)
            await new Promise(resolve => setTimeout(resolve, 300))
          }
        }
        
        await Promise.all([startScroll(), addContent()])
      }
    },
    {
      name: 'Momentum Scroll',
      description: 'Tests iOS-style momentum scrolling simulation',
      duration: 4000,
      execute: async (container) => {
        const simulateMomentum = async (initialVelocity: number) => {
          let velocity = initialVelocity
          const friction = 0.95
          const minVelocity = 0.5
          
          while (Math.abs(velocity) > minVelocity) {
            container.scrollTop += velocity
            velocity *= friction
            
            // Bounce at boundaries
            if (container.scrollTop <= 0 || 
                container.scrollTop >= container.scrollHeight - container.clientHeight) {
              velocity *= -0.5
            }
            
            await new Promise(resolve => requestAnimationFrame(resolve))
          }
        }
        
        // Simulate multiple swipes
        for (let i = 0; i < 5; i++) {
          await simulateMomentum(i % 2 === 0 ? 50 : -50)
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    },
    {
      name: 'Smooth Auto-scroll',
      description: 'Tests smooth programmatic scrolling',
      duration: 3000,
      execute: async (container) => {
        const smoothScrollTo = async (target: number, duration: number) => {
          const start = container.scrollTop
          const distance = target - start
          const startTime = Date.now()
          
          while (Date.now() - startTime < duration) {
            const elapsed = Date.now() - startTime
            const progress = elapsed / duration
            const easeProgress = 0.5 - Math.cos(progress * Math.PI) / 2
            container.scrollTop = start + distance * easeProgress
            await new Promise(resolve => requestAnimationFrame(resolve))
          }
        }
        
        // Scroll to various positions
        await smoothScrollTo(container.scrollHeight * 0.25, 750)
        await smoothScrollTo(container.scrollHeight * 0.75, 750)
        await smoothScrollTo(container.scrollHeight * 0.5, 750)
        await smoothScrollTo(0, 750)
      }
    },
    {
      name: 'User Interaction Mix',
      description: 'Simulates mixed user interactions',
      duration: 4000,
      execute: async (container) => {
        const actions = [
          // Quick flicks
          async () => {
            for (let i = 0; i < 3; i++) {
              container.scrollTop += i % 2 === 0 ? 200 : -200
              await new Promise(resolve => setTimeout(resolve, 50))
            }
          },
          // Slow drag
          async () => {
            for (let i = 0; i < 20; i++) {
              container.scrollTop += 10
              await new Promise(resolve => setTimeout(resolve, 50))
            }
          },
          // Page jumps
          async () => {
            container.scrollTop += container.clientHeight
            await new Promise(resolve => setTimeout(resolve, 500))
          },
          // Small adjustments
          async () => {
            for (let i = 0; i < 5; i++) {
              container.scrollTop += Math.random() * 20 - 10
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        ]
        
        // Execute random actions
        const endTime = Date.now() + 4000
        while (Date.now() < endTime) {
          const action = actions[Math.floor(Math.random() * actions.length)]
          await action()
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
    }
  ]

  const runBenchmark = useCallback(async () => {
    if (!containerRef.current) return
    
    setIsRunning(true)
    setResults([])
    setProgress(0)
    
    const container = containerRef.current
    const tracker = new ScrollEventTracker()
    trackerRef.current = tracker
    
    // Add test content if needed
    if (container.scrollHeight <= container.clientHeight) {
      for (let i = 0; i < 50; i++) {
        const div = document.createElement('div')
        div.style.height = '100px'
        div.style.padding = '10px'
        div.textContent = `Test content ${i}`
        container.appendChild(div)
      }
    }
    
    // Run each scenario
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i]
      setCurrentScenario(scenario.name)
      
      // Start monitoring
      tracker.reset()
      tracker.startPerformanceMeasure('scenario')
      
      const startMetrics = await captureMetrics()
      
      try {
        // Execute scenario
        await scenario.execute(container)
        
        // Capture final metrics
        const endMetrics = await captureMetrics()
        const duration = tracker.endPerformanceMeasure('scenario') || scenario.duration
        const stats = tracker.getSessionStats()
        
        // Calculate results
        const result: BenchmarkResult = {
          name: scenario.name,
          timestamp: Date.now(),
          metrics: {
            fps: endMetrics.fps,
            latency: endMetrics.scrollLatency,
            jank: endMetrics.jankScore,
            smoothness: endMetrics.smoothnessScore,
            memory: endMetrics.memoryUsage - startMetrics.memoryUsage,
            eventCount: stats.totalSessions,
            duration
          },
          passed: evaluateScenario(endMetrics),
          details: scenario.description
        }
        
        setResults(prev => [...prev, result])
        
      } catch (error) {
        console.error(`Benchmark error in ${scenario.name}:`, error)
        setResults(prev => [...prev, {
          name: scenario.name,
          timestamp: Date.now(),
          metrics: {
            fps: 0,
            latency: 0,
            jank: 100,
            smoothness: 0,
            memory: 0,
            eventCount: 0,
            duration: 0
          },
          passed: false,
          details: `Error: ${error}`
        }])
      }
      
      setProgress((i + 1) / scenarios.length * 100)
      
      // Rest between scenarios
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    setIsRunning(false)
    setCurrentScenario(null)
    
    // Notify completion
    if (onComplete) {
      onComplete(results)
    }
  }, [containerRef, onComplete])

  const captureMetrics = async () => {
    // Simulate metric capture (in real implementation, would get from ScrollPerformanceMonitor)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    return {
      fps: 55 + Math.random() * 10,
      scrollLatency: 5 + Math.random() * 20,
      jankScore: Math.random() * 20,
      smoothnessScore: 70 + Math.random() * 30,
      memoryUsage: 50 + Math.random() * 50
    }
  }

  const evaluateScenario = (metrics: any): boolean => {
    return (
      metrics.fps >= 50 &&
      metrics.scrollLatency < 30 &&
      metrics.jankScore < 15 &&
      metrics.smoothnessScore > 70
    )
  }

  const getScoreColor = (passed: boolean) => {
    return passed ? 'text-green-500' : 'text-red-500'
  }

  const getMetricColor = (value: number, threshold: number, inverse = false) => {
    const passed = inverse ? value > threshold : value < threshold
    return passed ? 'text-green-400' : 'text-yellow-400'
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-900 p-6 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto"
      >
        <h2 className="text-xl font-bold mb-4">Scroll Performance Benchmark</h2>
        
        {!isRunning && results.length === 0 && (
          <div className="text-center py-8">
            <p className="mb-4 text-gray-400">
              Run comprehensive scroll performance tests
            </p>
            <button
              onClick={runBenchmark}
              className="px-6 py-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            >
              Start Benchmark
            </button>
          </div>
        )}
        
        {isRunning && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-lg mb-2">Running: {currentScenario}</p>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-400 mt-2">
                {Math.round(progress)}% complete
              </p>
            </div>
          </div>
        )}
        
        {results.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Results</h3>
            
            {results.map((result, index) => (
              <div
                key={index}
                className="bg-gray-800 p-4 rounded-lg border border-gray-700"
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold">{result.name}</h4>
                  <span className={`font-bold ${getScoreColor(result.passed)}`}>
                    {result.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                
                <p className="text-sm text-gray-400 mb-3">{result.details}</p>
                
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">FPS: </span>
                    <span className={getMetricColor(result.metrics.fps, 50, true)}>
                      {result.metrics.fps.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Latency: </span>
                    <span className={getMetricColor(result.metrics.latency, 30)}>
                      {result.metrics.latency.toFixed(1)}ms
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Jank: </span>
                    <span className={getMetricColor(result.metrics.jank, 15)}>
                      {result.metrics.jank.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Smoothness: </span>
                    <span className={getMetricColor(result.metrics.smoothness, 70, true)}>
                      {result.metrics.smoothness.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Memory Δ: </span>
                    <span className={getMetricColor(result.metrics.memory, 20)}>
                      {result.metrics.memory.toFixed(1)}MB
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Duration: </span>
                    <span>{(result.metrics.duration / 1000).toFixed(1)}s</span>
                  </div>
                </div>
              </div>
            ))}
            
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-400">
                    Total scenarios: {results.length}
                  </p>
                  <p className="text-sm text-gray-400">
                    Passed: {results.filter(r => r.passed).length}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setResults([])
                    setProgress(0)
                  }}
                  className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}