const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:6270'

export type AnthropicErrorType = 
  | 'overloaded'
  | 'rate_limit'
  | 'context_length'
  | 'content_filter'
  | 'model_unavailable'
  | 'invalid_request'
  | 'internal_error'
  | 'timeout'
  | 'token_limit'

/**
 * Test utilities for simulating API behaviors
 */
export const testUtils = {
  /**
   * Test specific error patterns
   * @param errorType The type of error to simulate
   */
  async testError(errorType: AnthropicErrorType) {
    const response = await fetch(`${API_BASE}/codai/chat/test/error-simulation/${errorType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `Test ${errorType} error` }]
      }),
      cache: 'no-store'
    })

    // Allow error status codes as they're part of the test
    if (!response.ok && ![400, 429, 500, 503, 504].includes(response.status)) {
      throw new Error(`Test request failed: ${response.statusText}`)
    }

    return response
  },

  /**
   * Test retry pattern with eventual success
   * @param retryCount Current retry attempt number
   */
  async testRetryPattern(retryCount: number = 0) {
    const response = await fetch(`${API_BASE}/codai/chat/test/overload-pattern`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Retry-Count': retryCount.toString()
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Test retry pattern' }]
      }),
      cache: 'no-store'
    })

    // Allow error status codes for retry testing
    if (!response.ok && ![429, 503].includes(response.status)) {
      throw new Error(`Test request failed: ${response.statusText}`)
    }

    return response
  }
}