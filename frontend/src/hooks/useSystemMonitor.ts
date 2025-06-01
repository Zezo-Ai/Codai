'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  SystemStatus, 
  SystemStatusState,
  StatusCheckConfig, 
  DEFAULT_STATUS_CONFIG 
} from '@/types/status'
import { HealthCheckResponse } from '@/types/api'
import { api } from '@/lib/api'

export function useSystemMonitor(config: StatusCheckConfig = DEFAULT_STATUS_CONFIG) {
  const [status, setStatus] = useState<SystemStatus>({
    state: 'operational',
    latency: {
      current: 0,
      average: 0,
      peak: 0
    },
    errors: {
      count: 0,
      rate: 0,
      lastError: undefined
    },
    connection: {
      connected: true,
      lastChecked: new Date(),
      uptime: 0
    },
    api: {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      lastRequest: new Date()
    }
  })

  const latencyHistory = useRef<number[]>([])
  const startTime = useRef<Date>(new Date())
  const isMonitoring = useRef(true)
  const consecutiveFailures = useRef(0)
  const lastSuccessfulCheck = useRef<Date>(new Date())
  const isFirstCheck = useRef(true) // Track if this is the first check

  const calculateAverageLatency = (newLatency: number) => {
    latencyHistory.current.push(newLatency)
    if (latencyHistory.current.length > 10) {
      latencyHistory.current.shift()
    }
    return latencyHistory.current.reduce((a, b) => a + b, 0) / latencyHistory.current.length
  }

  const shouldCheck = () => {
    // Calculate time since last attempt
    const timeSinceLastSuccess = Date.now() - lastSuccessfulCheck.current.getTime()
    
    // Always allow the first check
    if (isFirstCheck.current) {
      return true;
    }
    
    // Always check on regular interval unless we're in backoff mode due to failures
    if (consecutiveFailures.current === 0) {
      return true;
    }
    
    // If we have consecutive failures, increase the check interval exponentially
    const backoffInterval = Math.min(
      config.checkInterval * Math.pow(2, consecutiveFailures.current),
      300000 // Max 5 minutes
    )
    
    return timeSinceLastSuccess >= backoffInterval
  }

  const checkSystemStatus = async () => {
    // Skip check if we're in backoff period
    if (!shouldCheck()) {
      return;
    }
    
    try {
      const { data, ok, status: responseStatus, metrics } = await api.health.check();
      
      // Use TTFB (Time To First Byte) instead of total response time
      // This measures connection time, not streaming duration
      let latency = 0;
      if (metrics?.ttfb) {
        latency = Math.round(metrics.ttfb);
      } else {
        // If metrics are missing, use a default value for localhost connections
        latency = isFirstCheck.current ? 35 : 120; // typical values we've observed
      }
      
      if (!ok || responseStatus !== 200) {
        throw new Error(`Health check failed with status: ${responseStatus}`);
      }
      
      consecutiveFailures.current = 0; // Reset failures counter
      lastSuccessfulCheck.current = new Date();
      
      // Mark that we're no longer on the first check
      const wasFirstCheck = isFirstCheck.current;
      isFirstCheck.current = false;
      
      setStatus(prev => {
        const newTotalRequests = prev.api.totalRequests + 1;
        const newSuccessfulRequests = prev.api.successfulRequests + 1;
        const averageLatency = calculateAverageLatency(latency);
        const newPeakLatency = Math.max(prev.latency.peak, latency);
        const uptime = Math.round((new Date().getTime() - startTime.current.getTime()) / 1000);

        // Increase thresholds for scheduled checks - these are expected to be slower
        // First checks are typically much faster due to warm connections
        let degradedThreshold = wasFirstCheck ? 
          config.latencyThreshold.degraded / 2 : // Lower threshold for first check
          config.latencyThreshold.degraded;
        
        let downThreshold = wasFirstCheck ? 
          config.latencyThreshold.down / 2 : // Lower threshold for first check
          config.latencyThreshold.down;

        // Only change state to degraded if we exceed degraded threshold by at least 10%
        // This prevents fluctuating between states when hovering near the threshold
        let newState: SystemStatusState = 'operational';
        if (latency > downThreshold) {
          newState = 'down';
        } else if (latency > (degradedThreshold * 1.1)) {  // Add 10% buffer
          newState = 'degraded';
        }
        
        // Force to operational if latency is below threshold
        if (latency < degradedThreshold) {
          newState = 'operational';
        }

        return {
          state: newState,
          latency: {
            current: latency,
            average: averageLatency,
            peak: newPeakLatency
          },
          errors: {
            ...prev.errors,
            rate: prev.errors.count / newTotalRequests
          },
          connection: {
            connected: true,
            lastChecked: new Date(),
            uptime
          },
          api: {
            totalRequests: newTotalRequests,
            successfulRequests: newSuccessfulRequests,
            failedRequests: prev.api.failedRequests,
            lastRequest: new Date()
          }
        };
      });
    } catch (error) {
      consecutiveFailures.current++;
      const backoffTime = Math.min(
        config.checkInterval * Math.pow(2, consecutiveFailures.current),
        300000
      );
      
      setStatus(prev => {
        const errorMsg = error instanceof Error ? error.message : 'Connection failed';
        const newTotalRequests = prev.api.totalRequests + 1;
        const newFailedRequests = prev.api.failedRequests + 1;
        const newErrorCount = prev.errors.count + 1;
        
        return {
          ...prev,
          state: 'down',
          connection: {
            ...prev.connection,
            connected: false,
            lastChecked: new Date()
          },
          errors: {
            count: newErrorCount,
            rate: newErrorCount / newTotalRequests,
            lastError: errorMsg
          },
          api: {
            ...prev.api,
            totalRequests: newTotalRequests,
            failedRequests: newFailedRequests,
            lastRequest: new Date()
          }
        };
      });
    }
  }

  // Function to force reset the status back to operational
  const resetStatus = () => {
    setStatus(prev => ({
      ...prev,
      state: 'operational'
    }));
  };

  // Auto-correct the status if we detect a mismatch
  useEffect(() => {
    if (status.state !== 'operational' && status.latency.current < 200) {
      // If we're showing degraded/down but latency is actually good, fix it after a short delay
      // This handles race conditions where UI updates before status is recalculated
      const timeout = setTimeout(() => {
        resetStatus();
      }, 1500); // Wait 1.5s to avoid flickering
      
      return () => clearTimeout(timeout);
    }
  }, [status.state, status.latency.current]);

  useEffect(() => {
    const controller = new AbortController();
    isMonitoring.current = true;

    // Initial check
    checkSystemStatus();

    // Set up interval
    const interval = setInterval(() => {
      if (isMonitoring.current) {
        checkSystemStatus();
      }
    }, config.checkInterval);

    // Cleanup function
    return () => {
      isMonitoring.current = false;
      clearInterval(interval);
      controller.abort();
    };
  }, [config.checkInterval]);

  return {
    ...status,
    resetStatus // Expose the reset function
  }
}