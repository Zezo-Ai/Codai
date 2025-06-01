// Main exports for scroll diagnostics
export { ScrollPerformanceMonitor } from './ScrollPerformanceMonitor'
export { ScrollEventTracker } from './ScrollEventTracker'
export type { ScrollEventData, ScrollPattern, ScrollSession } from './ScrollEventTracker'
export { ScrollBenchmark } from './ScrollBenchmark'
export { ScrollDebugOverlay } from './ScrollDebugOverlay'
export { RaceConditionDetector, AutoTracker } from './RaceConditionDetector'
export type { Operation, Overlap, RaceConditionReport } from './RaceConditionDetector'

// Utility function to enable all diagnostics in development
export function enableScrollDiagnostics() {
  if (process.env.NODE_ENV === 'development') {
    // Enable performance monitoring
    if ('PerformanceObserver' in window) {
      console.log('[Scroll Diagnostics] Performance monitoring enabled')
    }
    
    // Log memory info if available
    if ('memory' in performance) {
      console.log('[Scroll Diagnostics] Memory monitoring available')
    }
    
    // Add global debug commands
    if (typeof window !== 'undefined') {
      (window as any).scrollDiagnostics = {
        runBenchmark: () => {
          console.log('Run benchmark from component with ScrollBenchmark')
        },
        showMetrics: () => {
          console.log('Enable ScrollPerformanceMonitor overlay')
        },
        trackEvents: () => {
          console.log('ScrollEventTracker is tracking events automatically')
        }
      }
      
      console.log('[Scroll Diagnostics] Debug commands available at window.scrollDiagnostics')
    }
  }
}

// Performance profiling utilities
export class ScrollProfiler {
  private marks: Map<string, number> = new Map()
  private measures: Array<{ name: string; duration: number }> = []
  
  mark(name: string) {
    this.marks.set(name, performance.now())
  }
  
  measure(name: string, startMark: string, endMark?: string) {
    const start = this.marks.get(startMark)
    if (!start) {
      console.warn(`Mark '${startMark}' not found`)
      return
    }
    
    const end = endMark ? this.marks.get(endMark) : performance.now()
    if (!end) {
      console.warn(`Mark '${endMark}' not found`)
      return
    }
    
    const duration = end - start
    this.measures.push({ name, duration })
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ScrollProfiler] ${name}: ${duration.toFixed(2)}ms`)
    }
    
    return duration
  }
  
  getReport() {
    const report = {
      measures: [...this.measures],
      summary: {
        count: this.measures.length,
        total: this.measures.reduce((sum, m) => sum + m.duration, 0),
        average: 0,
        max: Math.max(...this.measures.map(m => m.duration)),
        min: Math.min(...this.measures.map(m => m.duration))
      }
    }
    
    report.summary.average = report.summary.total / report.summary.count
    
    return report
  }
  
  reset() {
    this.marks.clear()
    this.measures = []
  }
}

// Scroll testing utilities
export const ScrollTestUtils = {
  // Simulate smooth scroll
  async simulateSmoothScroll(
    container: HTMLElement,
    targetPosition: number,
    duration: number = 1000
  ): Promise<void> {
    const startPosition = container.scrollTop
    const distance = targetPosition - startPosition
    const startTime = performance.now()
    
    return new Promise(resolve => {
      const scroll = () => {
        const elapsed = performance.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // Easing function
        const easeInOutQuad = (t: number) => {
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        }
        
        container.scrollTop = startPosition + distance * easeInOutQuad(progress)
        
        if (progress < 1) {
          requestAnimationFrame(scroll)
        } else {
          resolve()
        }
      }
      
      requestAnimationFrame(scroll)
    })
  },
  
  // Generate test content
  generateTestContent(count: number, height: number = 100): DocumentFragment {
    const fragment = document.createDocumentFragment()
    
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div')
      div.style.height = `${height}px`
      div.style.padding = '10px'
      div.style.borderBottom = '1px solid #ccc'
      div.textContent = `Test item ${i + 1}`
      div.setAttribute('data-test-id', `item-${i}`)
      fragment.appendChild(div)
    }
    
    return fragment
  },
  
  // Wait for scroll to complete
  async waitForScrollEnd(container: HTMLElement, timeout: number = 500): Promise<void> {
    return new Promise(resolve => {
      let scrollTimer: NodeJS.Timeout
      
      const handleScroll = () => {
        clearTimeout(scrollTimer)
        scrollTimer = setTimeout(() => {
          container.removeEventListener('scroll', handleScroll)
          resolve()
        }, timeout)
      }
      
      container.addEventListener('scroll', handleScroll, { passive: true })
      handleScroll() // Start timer immediately
    })
  },
  
  // Measure scroll performance
  async measureScrollPerformance(
    container: HTMLElement,
    scrollFn: () => void | Promise<void>
  ): Promise<{
    duration: number
    frames: number
    averageFPS: number
    jank: number
  }> {
    const startTime = performance.now()
    let frameCount = 0
    let jankFrames = 0
    let lastFrameTime = startTime
    let measuring = true
    
    const measureFrame = () => {
      if (!measuring) return
      
      const now = performance.now()
      const frameDuration = now - lastFrameTime
      
      frameCount++
      if (frameDuration > 16.67 * 1.5) { // 1.5x target frame time
        jankFrames++
      }
      
      lastFrameTime = now
      requestAnimationFrame(measureFrame)
    }
    
    requestAnimationFrame(measureFrame)
    
    await scrollFn()
    await this.waitForScrollEnd(container)
    
    measuring = false
    const duration = performance.now() - startTime
    
    return {
      duration,
      frames: frameCount,
      averageFPS: (frameCount / duration) * 1000,
      jank: (jankFrames / frameCount) * 100
    }
  }
}