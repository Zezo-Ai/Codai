/**
 * Telemetry utilities for frontend monitoring and analytics
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logging/logger';
import { metrics } from '../logging/metrics';

interface TelemetryConfig {
  enabled: boolean;
  sampleRate: number;
  batchSize: number;
  flushInterval: number;
}

interface SessionData {
  sessionId: string;
  startTime: number;
  lastActivity: number;
  pageViews: number;
  interactions: number;
  errors: number;
}

export class Telemetry {
  private static instance: Telemetry;
  private config: TelemetryConfig;
  private session: SessionData;
  private queue: any[] = [];
  private flushTimer?: NodeJS.Timer;

  private constructor() {
    this.config = this.loadConfig();
    this.session = this.initSession();
    this.setupListeners();
    this.startFlushTimer();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): Telemetry {
    if (!Telemetry.instance) {
      Telemetry.instance = new Telemetry();
    }
    return Telemetry.instance;
  }

  /**
   * Track page view with performance data
   */
  public trackPageView(path: string, referrer?: string) {
    if (!this.shouldTrack()) return;

    const performance = this.collectPerformanceData();
    this.session.pageViews++;
    this.session.lastActivity = Date.now();

    this.queueEvent('pageview', {
      path,
      referrer,
      performance,
      sessionData: this.getSessionData()
    });
  }

  /**
   * Track user interaction
   */
  public trackInteraction(action: string, category: string, label?: string, value?: number) {
    if (!this.shouldTrack()) return;

    this.session.interactions++;
    this.session.lastActivity = Date.now();

    this.queueEvent('interaction', {
      action,
      category,
      label,
      value,
      sessionData: this.getSessionData()
    });
  }

  /**
   * Track error with context
   */
  public trackError(error: Error, componentStack?: string, errorInfo?: any) {
    this.session.errors++;
    this.session.lastActivity = Date.now();

    // Errors are always tracked regardless of sampling
    this.queueEvent('error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      componentStack,
      errorInfo,
      sessionData: this.getSessionData()
    }, true); // Force immediate flush for errors
  }

  /**
   * Track performance metric
   */
  public trackPerformance(name: string, value: number, tags?: Record<string, string>) {
    if (!this.shouldTrack()) return;

    this.queueEvent('performance', {
      name,
      value,
      tags,
      sessionData: this.getSessionData()
    });
  }

  /**
   * Track network request
   */
  public trackRequest(url: string, method: string, duration: number, status: number, error?: string) {
    if (!this.shouldTrack()) return;

    this.queueEvent('request', {
      url,
      method,
      duration,
      status,
      error,
      sessionData: this.getSessionData()
    });
  }

  /**
   * Manually flush queued events
   */
  public flush() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);
    this.sendTelemetry(batch).catch(error => {
      logger.error('Failed to send telemetry', { error });
      // Requeue failed events
      this.queue.unshift(...batch);
    });
  }

  private loadConfig(): TelemetryConfig {
    // Load from environment or defaults
    return {
      enabled: process.env.REACT_APP_TELEMETRY_ENABLED !== 'false',
      sampleRate: Number(process.env.REACT_APP_TELEMETRY_SAMPLE_RATE) || 0.1,
      batchSize: Number(process.env.REACT_APP_TELEMETRY_BATCH_SIZE) || 50,
      flushInterval: Number(process.env.REACT_APP_TELEMETRY_FLUSH_INTERVAL) || 5000
    };
  }

  private initSession(): SessionData {
    return {
      sessionId: uuidv4(),
      startTime: Date.now(),
      lastActivity: Date.now(),
      pageViews: 0,
      interactions: 0,
      errors: 0
    };
  }

  private setupListeners() {
    // Track visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush(); // Ensure data is sent before page unload
      }
    });

    // Track page unload
    window.addEventListener('beforeunload', () => {
      this.flush();
    });

    // Track network status
    window.addEventListener('online', () => {
      this.trackPerformance('network_status', 1, { status: 'online' });
    });

    window.addEventListener('offline', () => {
      this.trackPerformance('network_status', 0, { status: 'offline' });
    });
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private shouldTrack(): boolean {
    if (!this.config.enabled) return false;
    return Math.random() < this.config.sampleRate;
  }

  private queueEvent(type: string, data: any, immediate = false) {
    const event = {
      type,
      timestamp: Date.now(),
      data
    };

    this.queue.push(event);

    if (immediate || this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  private async sendTelemetry(events: any[]) {
    try {
      const response = await fetch('/api/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          events,
          metadata: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            screenSize: {
              width: window.screen.width,
              height: window.screen.height
            },
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Record successful telemetry send
      metrics.recordTelemetrySend({
        eventCount: events.length,
        status: 'success'
      });

    } catch (error) {
      metrics.recordTelemetrySend({
        eventCount: events.length,
        status: 'error',
        error: error.message
      });
      throw error; // Re-throw to trigger requeue
    }
  }

  private getSessionData(): Partial<SessionData> {
    const { sessionId, startTime, pageViews, interactions, errors } = this.session;
    return {
      sessionId,
      startTime,
      pageViews,
      interactions,
      errors,
      duration: Date.now() - startTime
    };
  }

  private collectPerformanceData() {
    const navigationTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paintTiming = performance.getEntriesByType('paint');

    return {
      navigation: {
        type: navigationTiming.type,
        dnsTime: navigationTiming.domainLookupEnd - navigationTiming.domainLookupStart,
        tcpTime: navigationTiming.connectEnd - navigationTiming.connectStart,
        responseTime: navigationTiming.responseEnd - navigationTiming.responseStart,
        domLoadTime: navigationTiming.domContentLoadedEventEnd - navigationTiming.domContentLoadedEventStart,
        loadTime: navigationTiming.loadEventEnd - navigationTiming.loadEventStart,
      },
      paint: {
        firstPaint: paintTiming.find(entry => entry.name === 'first-paint')?.startTime,
        firstContentfulPaint: paintTiming.find(entry => entry.name === 'first-contentful-paint')?.startTime,
      },
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      } : undefined,
    };
  }

  /**
   * Clean up resources
   */
  public destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush(); // Final flush
  }
}

// Export singleton instance
export const telemetry = Telemetry.getInstance();

// Export hook for React components
export function useTelemetry() {
  return telemetry;
}

// Export automatic tracking HOC
export function withTelemetry<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: {
    trackMount?: boolean;
    trackRender?: boolean;
    trackErrors?: boolean;
  } = {}
) {
  return class TelemetryWrapper extends React.Component<P> {
    componentDidMount() {
      if (options.trackMount) {
        telemetry.trackInteraction('mount', WrappedComponent.name);
      }
    }

    componentDidUpdate() {
      if (options.trackRender) {
        telemetry.trackInteraction('render', WrappedComponent.name);
      }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      if (options.trackErrors) {
        telemetry.trackError(error, errorInfo.componentStack);
      }
    }

    render() {
      return <WrappedComponent {...this.props} />;
    }
  };
}