export interface HealthCheckResponse {
  status: string;
  server: boolean;
  api_key_configured: boolean;
  timestamp: number;
  version: string;
}

export interface APIResponse<T> {
  ok: boolean;
  status: number;
  statusText: string;
  data: T;
  metrics?: {
    ttfb: number;     // Time To First Byte in milliseconds
    totalTime: number; // Total response time in milliseconds
  };
}