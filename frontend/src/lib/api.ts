import { featureFlags } from './featureFlags'
import { COMPUTER_USE_STORAGE_KEY } from '@/modules/computer-use/hooks/useComputerUse'
import { APIResponse, HealthCheckResponse } from '@/types/api'
import { AVAILABLE_MODELS } from '@/config/aiModels'
import { getApiBaseUrl } from './api-config'
import { isExpertModeEnabled } from './expertMode'

const API_CONSTANTS = {
  get BASE_URL() { return getApiBaseUrl(); }, // Make it dynamic
  TIMEOUT_MS: 300000,
  STREAM_RETRY_MS: 1000,
  ERROR_CODES: {
    TIMEOUT: 'REQUEST_TIMEOUT',
    NETWORK: 'NETWORK_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR',
    CHAT_FAILED: 'CHAT_REQUEST_FAILED',
    HEALTH_CHECK_FAILED: 'HEALTH_CHECK_FAILED',
    RESET_FAILED: 'RESET_FAILED',
    ENDPOINT_NOT_IMPLEMENTED: 'ENDPOINT_NOT_IMPLEMENTED',
    FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE'
  }
} as const

export class APIError extends Error {
  constructor(
    public status?: number,
    message?: string,
    public code?: string,
    public isSilent: boolean = false
  ) {
    super(message)
    this.name = 'APIError'
    Object.setPrototypeOf(this, APIError.prototype)
  }
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface APIResponse<T> {
  data: T
  status: number
  statusText: string
}

interface ChatResetRequest {
  session_id: string
}

const isStreamError = (error: unknown): boolean => {
  if (error instanceof TypeError && error.message === 'network error') {
    // Check if this is a streaming disconnect
    return true;
  }
  // Add other streaming error checks as needed
  return false;
};

const handleAPIError = (error: unknown): never => {


  // If it's already an APIError, just rethrow it
  if (error instanceof APIError) {

    throw error;
  }

  // Handle specific error types
  if (error instanceof Error) {


    // Handle timeout
    if (error.name === 'AbortError') {
      throw new APIError(
        408,
        'Request timeout',
        API_CONSTANTS.ERROR_CODES.TIMEOUT
      );
    }

    // Handle network errors
    if (error instanceof TypeError) {


      if (isStreamError(error)) {
        // Handle streaming disconnect gracefully
        throw new APIError(
          499, // Client Closed Request
          'Stream connection ended',
          API_CONSTANTS.ERROR_CODES.NETWORK,
          true // Mark as silent
        );
      }

      if (error.message.includes('Failed to fetch')) {
        throw new APIError(
          503,
          'Network error: Unable to reach the server. Please check your connection.',
          API_CONSTANTS.ERROR_CODES.NETWORK
        );
      }

      if (error.message.includes('NetworkError')) {
        throw new APIError(
          503,
          'Network error: Connection refused or blocked. Check CORS settings.',
          API_CONSTANTS.ERROR_CODES.NETWORK
        );
      }
    }

    // Handle other known errors
    if (error.message.includes('CORS')) {
      throw new APIError(
        503,
        'Network error: CORS policy violation. Unable to access the server.',
        API_CONSTANTS.ERROR_CODES.NETWORK
      );
    }

    throw new APIError(
      500,
      `Network error: ${error.message}`,
      API_CONSTANTS.ERROR_CODES.NETWORK
    );
  }

  // Handle unknown errors

  
  throw new APIError(
    500,
    'An unknown error occurred. Check console for details.',
    API_CONSTANTS.ERROR_CODES.UNKNOWN
  );
}

export const api = {
  health: {
    check: async (): Promise<APIResponse<HealthCheckResponse>> => {
      // Use a shorter timeout for health checks
      const HEALTH_CHECK_TIMEOUT = 2000; // 2 seconds is enough for lightweight check
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, HEALTH_CHECK_TIMEOUT);

      try {
        const url = `${API_CONSTANTS.BASE_URL}/health`;
        
        // Track time to first byte separately
        const fetchStart = performance.now();
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Request-Type': 'health-check', // This signals the server to return a lightweight response
            'X-Health-Check-Priority': 'high' // Hint for any middleware that this is a priority check
          },
          signal: controller.signal,
          cache: 'no-store',
          priority: 'high' // Browser hint that this is a high priority request
        });
        
        // Calculate time to first byte (TTFB)
        const ttfb = performance.now() - fetchStart;

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new APIError(
            response.status,
            `Health check failed: ${response.statusText}`,
            API_CONSTANTS.ERROR_CODES.HEALTH_CHECK_FAILED
          );
        }

        // Start timing for reading the body
        const bodyStart = performance.now();
        const data = await response.json();
        const totalTime = performance.now() - fetchStart;
        
        // Validate response data
        if (!data || typeof data.status === 'undefined') {
          throw new APIError(
            500,
            'Invalid health check response format',
            API_CONSTANTS.ERROR_CODES.HEALTH_CHECK_FAILED
          );
        }
        
        // Calculate timing metrics but don't log them
        const timingMetrics = {
          ttfb: ttfb.toFixed(2) + 'ms',
          bodyRead: (performance.now() - bodyStart).toFixed(2) + 'ms',
          total: totalTime.toFixed(2) + 'ms'
        };

        return { 
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data,
          metrics: {
            ttfb,
            totalTime
          }
        };
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    }
  },
  chat: {
    getConfig: async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONSTANTS.TIMEOUT_MS)

      try {
        const response = await fetch(`${API_CONSTANTS.BASE_URL}/codai/chat/config`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new APIError(
            response.status,
            `Failed to get chat config: ${response.statusText}`,
            API_CONSTANTS.ERROR_CODES.UNKNOWN
          )
        }

        const data = await response.json()
        return { ok: true, data }
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    },
    updateConfig: async (config: any) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONSTANTS.TIMEOUT_MS)

      try {
        const response = await fetch(`${API_CONSTANTS.BASE_URL}/codai/chat/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(config),
          signal: controller.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new APIError(
            response.status,
            `Failed to update chat config: ${response.statusText}`,
            API_CONSTANTS.ERROR_CODES.UNKNOWN
          )
        }

        const data = await response.json()
        return { ok: true, data }
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    },
    reset: async (sessionId: string) => {


      // Step 1: Feature flag check
      let isAvailable;
      try {
        isAvailable = await featureFlags.checkFeatureAvailability('chatReset');

      } catch (error) {

        isAvailable = true; // Default to enabled if check fails
      }
      
      if (!isAvailable) {

        throw new APIError(
          501,
          'Chat reset functionality is not yet available',
          API_CONSTANTS.ERROR_CODES.FEATURE_NOT_AVAILABLE,
          true // Mark as silent error
        );
      }

      // Step 2: Setup request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort();

      }, API_CONSTANTS.TIMEOUT_MS)

      try {
        const request: ChatResetRequest = { session_id: sessionId }
        const url = `${API_CONSTANTS.BASE_URL}/codai/chat/reset`;
        


        // Test server availability
        try {
          const healthCheck = await fetch(`${API_CONSTANTS.BASE_URL}/health`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });

        } catch (healthError) {

        }
        
        // Step 3: Make request

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(request),
          signal: controller.signal,
          cache: 'no-store',
        });

        clearTimeout(timeoutId);

        // Step 4: Log response details


        // Step 5: Handle non-OK responses
        if (!response.ok) {
          let errorDetail;
          let responseText;
          
          try {
            responseText = await response.text();

            
            try {
              const errorJson = JSON.parse(responseText);
              errorDetail = errorJson.detail || errorJson.message || response.statusText;
            } catch (e) {
              errorDetail = responseText || response.statusText;
            }
          } catch (e) {

            errorDetail = response.statusText;
          }

          throw new APIError(
            response.status,
            `Chat reset failed: ${errorDetail}`,
            API_CONSTANTS.ERROR_CODES.RESET_FAILED
          )
        }

        // Step 6: Parse and validate successful response
        try {
          const data = await response.json();

          return { ok: true, data };
        } catch (e) {

          return { ok: true }; // Return basic success if parsing fails
        }
      } catch (error) {

        if (error instanceof Error) {

        }
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    },
    send: async (messages: ChatMessage[], sessionId?: string, model?: string) => {
      const controller = new AbortController()
      let timeoutId: NodeJS.Timeout | null = null

      try {


        // Get computer use state from localStorage with explicit default
        const computerUseEnabled = localStorage.getItem(COMPUTER_USE_STORAGE_KEY) ?? 'true'
        
        // Get expert mode state from localStorage
        const expertModeEnabled = isExpertModeEnabled()

        // Validate model if provided
        if (model && !AVAILABLE_MODELS.includes(model as any)) {
          console.warn(`Invalid model requested: ${model}. Using default.`);
          model = undefined; // Let backend use default
        }

        // Build request metadata
        const metadata = {
          session_id: sessionId || 'default_session',
          category: 'system',
          expert_mode_enabled: expertModeEnabled
        };

        // Build complete request
        const requestBody = {
          messages,
          stream: true,
          metadata,
          ...(model && { model }) // Only include model if provided
        };






        // Setup request
        const url = `${API_CONSTANTS.BASE_URL}/codai/chat/stream`;
        
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Computer-Use-Enabled': computerUseEnabled,
          'Accept': 'text/event-stream'
        };
        
        // Note: API key is now stored on backend and retrieved automatically
        // No need to send it in headers anymore



        // Setup timeout handler
        const timeoutHandler = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error(`Request timed out after ${API_CONSTANTS.TIMEOUT_MS}ms`));
          }, API_CONSTANTS.TIMEOUT_MS);
        });

        // Setup fetch request
        const fetchRequest = fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
          cache: 'no-store',
        });

        // Wait for either completion or timeout
        const response = await Promise.race([fetchRequest, timeoutHandler]);

        // Clear timeout once we have a response
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }



        if (!response.ok) {
          const errorDetail = await response.text().catch(() => response.statusText);

          
          throw new APIError(
            response.status,
            `Chat request failed: ${errorDetail}`,
            API_CONSTANTS.ERROR_CODES.CHAT_FAILED
          );
        }

        // Extra validation for streaming response
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('text/event-stream')) {

        }

        return response
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    }
  },
  edit: {
    view: async (path: string, viewRange?: [number, number]) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONSTANTS.TIMEOUT_MS)

      try {
        const response = await fetch(`${API_CONSTANTS.BASE_URL}/edit/view`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path, view_range: viewRange }),
          signal: controller.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new APIError(
            response.status,
            `Failed to view file: ${response.statusText}`,
            API_CONSTANTS.ERROR_CODES.ENDPOINT_NOT_IMPLEMENTED
          )
        }

        return response
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    },
    create: async (path: string, content: string) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONSTANTS.TIMEOUT_MS)

      try {
        const response = await fetch(`${API_CONSTANTS.BASE_URL}/edit/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path, content }),
          signal: controller.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new APIError(
            response.status,
            `Failed to create file: ${response.statusText}`,
            API_CONSTANTS.ERROR_CODES.ENDPOINT_NOT_IMPLEMENTED
          )
        }

        return response
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    },
    replace: async (path: string, oldStr: string, newStr: string) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONSTANTS.TIMEOUT_MS)

      try {
        const response = await fetch(`${API_CONSTANTS.BASE_URL}/edit/replace`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path, old_str: oldStr, new_str: newStr }),
          signal: controller.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new APIError(
            response.status,
            `Failed to replace text: ${response.statusText}`,
            API_CONSTANTS.ERROR_CODES.ENDPOINT_NOT_IMPLEMENTED
          )
        }

        return response
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    },
    insert: async (path: string, insertLine: number, newStr: string) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONSTANTS.TIMEOUT_MS)

      try {
        const response = await fetch(`${API_CONSTANTS.BASE_URL}/edit/insert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path, insert_line: insertLine, new_str: newStr }),
          signal: controller.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new APIError(
            response.status,
            `Failed to insert text: ${response.statusText}`,
            API_CONSTANTS.ERROR_CODES.ENDPOINT_NOT_IMPLEMENTED
          )
        }

        return response
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    },
    undo: async (path: string) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_CONSTANTS.TIMEOUT_MS)

      try {
        const response = await fetch(`${API_CONSTANTS.BASE_URL}/edit/undo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path }),
          signal: controller.signal,
          cache: 'no-store',
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new APIError(
            response.status,
            `Failed to undo edit: ${response.statusText}`,
            API_CONSTANTS.ERROR_CODES.ENDPOINT_NOT_IMPLEMENTED
          )
        }

        return response
      } catch (error) {
        throw handleAPIError(error)
      } finally {
        clearTimeout(timeoutId)
      }
    }
  }
}