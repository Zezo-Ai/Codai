'use client'

import React, { useState, useRef, useCallback } from 'react';
import { ScrollPerformanceMonitor } from './ScrollPerformanceMonitor';

interface BenchmarkResult {
  scenario: string;
  averageFPS: number;
  minFPS: number;
  maxFPS: number;
  jankEvents: number;
  totalTime: number;
  scrollEvents: number;
  memoryUsageMB: number;
  passed: boolean;
}

interface ScrollBenchmarkProps {
  containerRef: React.RefObject<HTMLElement>;
  onComplete?: (results: BenchmarkResult[]) => void;
}

export const ScrollBenchmark: React.FC<ScrollBenchmarkProps> = ({
  containerRef,
  onComplete
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentScenario, setCurrentScenario] = useState('');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const performanceDataRef = useRef<any[]>([]);

  const scenarios = [
    {
      name: 'Rapid Continuous Scroll',
      description: 'Scrolls up and down rapidly',
      duration: 5000,
      action: async (container: HTMLElement) => {
        const startHeight = container.scrollHeight;
        let direction = 1;
        const scrollAmount = 50;
        
        const interval = setInterval(() => {
          container.scrollTop += scrollAmount * direction;
          if (container.scrollTop >= container.scrollHeight - container.clientHeight || 
              container.scrollTop <= 0) {
            direction *= -1;
          }
        }, 20); // 50 scrolls per second
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        clearInterval(interval);
      }
    },
    {
      name: 'Large Content Update',
      description: 'Adds large amounts of content while scrolling',
      duration: 3000,
      action: async (container: HTMLElement) => {
        // Add content every 100ms
        const interval = setInterval(() => {
          const newContent = document.createElement('div');
          newContent.style.height = '200px';
          newContent.textContent = `New content block ${Date.now()}`;
          container.appendChild(newContent);
          
          // Auto-scroll to bottom
          container.scrollTop = container.scrollHeight;
        }, 100);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        clearInterval(interval);
        
        // Clean up added content
        while (container.lastChild) {
          container.removeChild(container.lastChild);
        }
      }
    },
    {
      name: 'Momentum Scroll Simulation',
      description: 'Simulates touch momentum scrolling',
      duration: 4000,
      action: async (container: HTMLElement) => {
        let velocity = 100;
        const friction = 0.95;
        
        const animate = () => {
          if (Math.abs(velocity) > 0.5) {
            container.scrollTop += velocity;
            velocity *= friction;
            requestAnimationFrame(animate);
          }
        };
        
        // Multiple momentum scrolls
        for (let i = 0; i < 5; i++) {
          velocity = (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 40);
          animate();
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
    },
    {
      name: 'Smooth Auto-scroll',
      description: 'Continuous smooth scrolling to bottom',
      duration: 3000,
      action: async (container: HTMLElement) => {
        const startTime = Date.now();
        const duration = 3000;
        const startScroll = container.scrollTop;
        const endScroll = container.scrollHeight - container.clientHeight;
        
        const smoothScroll = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easeProgress = 0.5 - Math.cos(progress * Math.PI) / 2;
          
          container.scrollTop = startScroll + (endScroll - startScroll) * easeProgress;
          
          if (progress < 1) {
            requestAnimationFrame(smoothScroll);
          }
        };
        
        smoothScroll();
        await new Promise(resolve => setTimeout(resolve, duration));
      }
    },
    {
      name: 'Mixed User Interaction',
      description: 'Combines manual scrolling with auto-scroll',
      duration: 4000,
      action: async (container: HTMLElement) => {
        // Alternate between user scroll and auto-scroll
        for (let i = 0; i < 8; i++) {
          if (i % 2 === 0) {
            // User scroll
            container.scrollTop = Math.random() * (container.scrollHeight - container.clientHeight);
          } else {
            // Auto-scroll to bottom
            container.scrollTo({
              top: container.scrollHeight,
              behavior: 'smooth'
            });
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  ];

  const runBenchmark = useCallback(async () => {
    if (!containerRef.current) {
      console.error('No container ref available');
      return;
    }

    setIsRunning(true);
    setResults([]);
    const benchmarkResults: BenchmarkResult[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      setCurrentScenario(scenario.name);
      setProgress((i / scenarios.length) * 100);
      
      // Reset performance data
      performanceDataRef.current = [];
      
      // Collect baseline
      const startTime = Date.now();
      const startMemory = performance.memory ? 
        (performance as any).memory.usedJSHeapSize / 1048576 : 0;
      
      // Run scenario
      await scenario.action(containerRef.current);
      
      // Wait for any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Calculate results
      const totalTime = Date.now() - startTime;
      const reports = performanceDataRef.current;
      
      const fpsValues = reports.map(r => r.metrics.fps);
      const averageFPS = fpsValues.length > 0 ? 
        fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length : 60;
      const minFPS = Math.min(...fpsValues, 60);
      const maxFPS = Math.max(...fpsValues, 60);
      const jankEvents = reports.filter(r => r.metrics.fps < 30).length;
      const scrollEvents = reports.reduce((sum, r) => sum + r.metrics.scrollEvents, 0);
      const endMemory = performance.memory ? 
        (performance as any).memory.usedJSHeapSize / 1048576 : 0;
      const memoryUsage = endMemory - startMemory;
      
      // Determine pass/fail
      const passed = averageFPS >= 50 && jankEvents < 5 && memoryUsage < 50;
      
      const result: BenchmarkResult = {
        scenario: scenario.name,
        averageFPS,
        minFPS,
        maxFPS,
        jankEvents,
        totalTime,
        scrollEvents,
        memoryUsageMB: memoryUsage,
        passed
      };
      
      benchmarkResults.push(result);
    }

    setProgress(100);
    setResults(benchmarkResults);
    setIsRunning(false);
    setCurrentScenario('');
    
    if (onComplete) {
      onComplete(benchmarkResults);
    }
  }, [containerRef, scenarios, onComplete]);

  const handlePerformanceReport = useCallback((report: any) => {
    performanceDataRef.current.push(report);
  }, []);

  const getScoreColor = (passed: boolean) => passed ? '#22c55e' : '#ef4444';
  const getScoreEmoji = (passed: boolean) => passed ? '✅' : '❌';

  return (
    <div className="fixed bottom-20 left-4 bg-white rounded-lg shadow-lg p-4 max-w-md z-50">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Scroll Performance Benchmark</h3>
        
        {!isRunning && results.length === 0 && (
          <button
            onClick={runBenchmark}
            className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
          >
            Start Benchmark
          </button>
        )}

        {isRunning && (
          <div>
            <div className="mb-2">
              <div className="text-sm text-gray-600">Running: {currentScenario}</div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {!isRunning && results.length > 0 && (
          <div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.map((result, index) => (
                <div 
                  key={index}
                  className="border rounded p-3 bg-gray-50"
                  style={{ borderColor: getScoreColor(result.passed) }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{result.scenario}</span>
                    <span className="text-lg">{getScoreEmoji(result.passed)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-600">Avg FPS:</span>
                      <span className="ml-1 font-mono">{result.averageFPS.toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Min FPS:</span>
                      <span className="ml-1 font-mono">{result.minFPS}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Jank Events:</span>
                      <span className="ml-1 font-mono">{result.jankEvents}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Memory:</span>
                      <span className="ml-1 font-mono">{result.memoryUsageMB.toFixed(1)}MB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Overall Score:</span>
                <span className="text-lg">
                  {results.filter(r => r.passed).length}/{results.length} Passed
                </span>
              </div>
              <button
                onClick={runBenchmark}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
              >
                Run Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden performance monitor to collect data */}
      {isRunning && (
        <div style={{ position: 'absolute', visibility: 'hidden' }}>
          <ScrollPerformanceMonitor
            containerRef={containerRef}
            enabled={true}
            onReport={handlePerformanceReport}
            showOverlay={false}
            samplingInterval={50}
          />
        </div>
      )}
    </div>
  );
};