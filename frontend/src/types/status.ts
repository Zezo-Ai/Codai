// System Status Types
export type SystemStatusState = 'operational' | 'degraded' | 'down';

// Latency Metrics
export interface LatencyMetrics {
  current: number;
  average: number;
  peak: number;
}

// Error Metrics
export interface ErrorMetrics {
  count: number;
  rate: number;
  lastError?: string;
}

// Connection Status
export interface ConnectionStatus {
  connected: boolean;
  lastChecked: Date;
  uptime: number;
}

// API Metrics
export interface ApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastRequest: Date;
}

// Complete System Status
export interface SystemStatus {
  state: SystemStatusState;
  latency: LatencyMetrics;
  errors: ErrorMetrics;
  connection: ConnectionStatus;
  api: ApiMetrics;
  resetStatus?: () => void; // Optional function to force status to operational
}

// Status Check Configuration
export interface StatusCheckConfig {
  checkInterval: number;
  latencyThreshold: {
    degraded: number;
    down: number;
  };
  errorRateThreshold: {
    degraded: number;
    down: number;
  };
}

// Default configuration
export const DEFAULT_STATUS_CONFIG: StatusCheckConfig = {
  checkInterval: 15000, // Check every 15s
  latencyThreshold: {
    // Adjusted for shared resources with the main app
    degraded: 300,  // Higher threshold to accommodate fluctuations due to shared port
    down: 600       // Higher threshold for down state
  },
  errorRateThreshold: {
    degraded: 0.1,
    down: 0.3
  }
};