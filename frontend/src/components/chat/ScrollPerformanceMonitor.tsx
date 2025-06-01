'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface ScrollMetrics {
  fps: number;
  frameTime: number;
  scrollLatency: number;
  domMutations: number;
  memoryUsage: number;
  jankScore: number;
  smoothnessScore: number;
  scrollVelocity: number;
  isScrolling: boolean;
  lastScrollTime: number;
  scrollEvents: number;
  reflows: number;
  conflicts: number;
}

interface PerformanceReport {
  timestamp: number;
  metrics: ScrollMetrics;
  warnings: string[];
  sessionDuration: number;
  averageFPS: number;
  peakMemoryUsage: number;
  totalJankEvents: number;
}

interface ScrollPerformanceMonitorProps {
  containerRef: React.RefObject<HTMLElement>;
  enabled?: boolean;
  onReport?: (report: PerformanceReport) => void;
  samplingInterval?: number;
  showOverlay?: boolean;
}

export const ScrollPerformanceMonitor: React.FC<ScrollPerformanceMonitorProps> = ({
  containerRef,
  enabled = true,
  onReport,
  samplingInterval = 100,
  showOverlay = true,
}) => {
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    fps: 60,
    frameTime: 16.67,
    scrollLatency: 0,
    domMutations: 0,
    memoryUsage: 0,
    jankScore: 0,
    smoothnessScore: 100,
    scrollVelocity: 0,
    isScrolling: false,
    lastScrollTime: 0,
    scrollEvents: 0,
    reflows: 0,
    conflicts: 0,
  });

  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const scrollStartTimeRef = useRef(0);
  const lastScrollPositionRef = useRef(0);
  const mutationCountRef = useRef(0);
  const sessionStartRef = useRef(Date.now());
  const fpsHistoryRef = useRef<number[]>([]);
  const memoryPeakRef = useRef(0);
  const jankEventsRef = useRef(0);
  const rafIdRef = useRef<number>();
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const metricsIntervalRef = useRef<NodeJS.Timeout>();

  // FPS calculation
  const calculateFPS = useCallback(() => {
    const now = performance.now();
    const delta = now - lastFrameTimeRef.current;
    
    if (delta >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / delta);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
      fpsHistoryRef.current.push(fps);
      
      // Keep only last 60 samples (1 minute at 1 sample/sec)
      if (fpsHistoryRef.current.length > 60) {
        fpsHistoryRef.current.shift();
      }
      
      // Detect jank (FPS < 30)
      if (fps < 30) {
        jankEventsRef.current++;
      }
      
      return fps;
    }
    
    frameCountRef.current++;
    return metrics.fps;
  }, [metrics.fps]);

  // Memory usage monitoring
  const getMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
      memoryPeakRef.current = Math.max(memoryPeakRef.current, usedMB);
      return usedMB;
    }
    return 0;
  }, []);

  // Scroll velocity calculation
  const calculateScrollVelocity = useCallback((currentPosition: number) => {
    const now = performance.now();
    const timeDelta = now - metrics.lastScrollTime;
    const positionDelta = Math.abs(currentPosition - lastScrollPositionRef.current);
    
    if (timeDelta > 0) {
      const velocity = positionDelta / timeDelta * 1000; // pixels per second
      lastScrollPositionRef.current = currentPosition;
      return velocity;
    }
    
    return 0;
  }, [metrics.lastScrollTime]);

  // Smoothness score calculation (0-100)
  const calculateSmoothnessScore = useCallback((fps: number, velocity: number) => {
    const fpsScore = Math.min(fps / 60, 1) * 50;
    const velocityScore = velocity > 0 ? Math.min(velocity / 1000, 1) * 50 : 50;
    return Math.round(fpsScore + velocityScore);
  }, []);

  // Jank score calculation (0-100, lower is better)
  const calculateJankScore = useCallback((fps: number, reflows: number) => {
    const fpsJank = Math.max(0, (60 - fps) / 60) * 50;
    const reflowJank = Math.min(reflows / 10, 1) * 50;
    return Math.round(fpsJank + reflowJank);
  }, []);

  // Animation frame loop
  const updateMetrics = useCallback(() => {
    if (!enabled || !containerRef.current) return;

    const fps = calculateFPS();
    const memoryUsage = getMemoryUsage();
    const container = containerRef.current;
    const scrollVelocity = calculateScrollVelocity(container.scrollTop);
    const smoothnessScore = calculateSmoothnessScore(fps, scrollVelocity);
    const jankScore = calculateJankScore(fps, metrics.reflows);

    setMetrics(prev => ({
      ...prev,
      fps,
      frameTime: fps > 0 ? 1000 / fps : 16.67,
      memoryUsage,
      scrollVelocity,
      smoothnessScore,
      jankScore,
      domMutations: mutationCountRef.current,
    }));

    rafIdRef.current = requestAnimationFrame(updateMetrics);
  }, [enabled, containerRef, calculateFPS, getMemoryUsage, calculateScrollVelocity, calculateSmoothnessScore, calculateJankScore, metrics.reflows]);

  // Scroll event handler
  const handleScroll = useCallback((e: Event) => {
    const now = performance.now();
    
    if (!metrics.isScrolling) {
      scrollStartTimeRef.current = now;
      setMetrics(prev => ({ ...prev, isScrolling: true }));
    }

    // Calculate scroll latency
    const latency = scrollStartTimeRef.current ? now - scrollStartTimeRef.current : 0;

    setMetrics(prev => ({
      ...prev,
      scrollLatency: latency,
      lastScrollTime: now,
      scrollEvents: prev.scrollEvents + 1,
    }));

    // Reset scrolling state after scroll ends
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      setMetrics(prev => ({ ...prev, isScrolling: false }));
    }, 150);
  }, [metrics.isScrolling]);

  // DOM mutation observer
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const observer = new MutationObserver((mutations) => {
      mutationCountRef.current += mutations.length;
      
      // Detect potential reflows
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          setMetrics(prev => ({ ...prev, reflows: prev.reflows + 1 }));
        }
      });
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    return () => observer.disconnect();
  }, [enabled, containerRef]);

  // Event listeners
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [enabled, containerRef, handleScroll]);

  // Start animation frame loop
  useEffect(() => {
    if (enabled) {
      rafIdRef.current = requestAnimationFrame(updateMetrics);
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [enabled, updateMetrics]);

  // Generate and send reports
  useEffect(() => {
    if (!enabled || !onReport) return;

    metricsIntervalRef.current = setInterval(() => {
      const averageFPS = fpsHistoryRef.current.length > 0
        ? Math.round(fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length)
        : 60;

      const warnings: string[] = [];
      if (averageFPS < 30) warnings.push('Low FPS detected');
      if (metrics.jankScore > 50) warnings.push('High jank score');
      if (metrics.memoryUsage > 500) warnings.push('High memory usage');
      if (metrics.conflicts > 0) warnings.push('Scroll conflicts detected');

      const report: PerformanceReport = {
        timestamp: Date.now(),
        metrics: { ...metrics },
        warnings,
        sessionDuration: Date.now() - sessionStartRef.current,
        averageFPS,
        peakMemoryUsage: memoryPeakRef.current,
        totalJankEvents: jankEventsRef.current,
      };

      onReport(report);
    }, 5000); // Report every 5 seconds

    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
    };
  }, [enabled, metrics, onReport]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  if (!enabled || !showOverlay) return null;

  return (
    <div className="scroll-performance-monitor" style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: '#fff',
      padding: '10px 15px',
      borderRadius: '8px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 9999,
      minWidth: '200px',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #666', paddingBottom: '5px' }}>
        Scroll Performance
      </div>
      <div style={{ display: 'grid', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>FPS:</span>
          <span style={{ color: metrics.fps < 30 ? '#ff4444' : metrics.fps < 50 ? '#ffaa00' : '#44ff44' }}>
            {metrics.fps}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Latency:</span>
          <span>{metrics.scrollLatency.toFixed(1)}ms</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Memory:</span>
          <span>{metrics.memoryUsage}MB</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Mutations:</span>
          <span>{metrics.domMutations}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Smoothness:</span>
          <span style={{ color: metrics.smoothnessScore < 50 ? '#ff4444' : metrics.smoothnessScore < 80 ? '#ffaa00' : '#44ff44' }}>
            {metrics.smoothnessScore}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Jank:</span>
          <span style={{ color: metrics.jankScore > 50 ? '#ff4444' : metrics.jankScore > 20 ? '#ffaa00' : '#44ff44' }}>
            {metrics.jankScore}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Velocity:</span>
          <span>{metrics.scrollVelocity.toFixed(0)}px/s</span>
        </div>
        {metrics.isScrolling && (
          <div style={{ 
            marginTop: '4px', 
            padding: '2px 6px', 
            background: '#0066ff', 
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            SCROLLING
          </div>
        )}
      </div>
    </div>
  );
};