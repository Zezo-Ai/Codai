'use client'

import { useState, useEffect } from 'react'

interface TokenMetrics {
  currentSession: {
    inputTokens: number
    outputTokens: number
  }
  cache: {
    hits: number
    creationTokens: number
    readTokens: number
    hitRate: number
  }
  history: Array<{
    total: number
    timestamp: string
    input: number
    output: number
  }>
}

export function useTokenMetrics() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<TokenMetrics>({
    currentSession: {
      inputTokens: 0,
      outputTokens: 0
    },
    cache: {
      hits: 0,
      creationTokens: 0,
      readTokens: 0,
      hitRate: 0
    },
    history: []
  })

  const refreshMetrics = async () => {
    console.log('🔄 Fetching token metrics...');
    setIsLoading(true)
    setError(null) // Clear any previous errors
    try {
      // Fetch latest metrics from API
      console.log('📡 Making request to /api/metrics/tokens');
      // Use environment variable for API base URL instead of hardcoded port
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/metrics/tokens`)
      
      // Handle specific HTTP errors
      if (!response.ok) {
        switch (response.status) {
          case 401:
            throw new Error('Authentication required. Please log in again.')
          case 403:
            throw new Error('You don\'t have permission to access these metrics.')
          case 404:
            throw new Error('Metrics endpoint not found. Service may be misconfigured.')
          case 429:
            throw new Error('Too many requests. Please try again in a moment.')
          case 500:
            throw new Error('Server error. Our team has been notified.')
          default:
            throw new Error(`Request failed with status: ${response.status}`)
        }
      }

      const data = await response.json()
      console.log('📊 Received metrics data:', JSON.stringify(data, null, 2));
      
      // Validate response data structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format: expected metrics object')
      }

      // Validate required properties
      const requiredProps = ['currentSession', 'cache', 'history']
      const missingProps = requiredProps.filter(prop => !(prop in data))
      
      if (missingProps.length > 0) {
        throw new Error(`Invalid metrics data: missing ${missingProps.join(', ')}`)
      }

      console.log('✅ Metrics validated, updating state');
      setMetrics(data)
    } catch (err) {
      let errorMessage = 'An unexpected error occurred'
      
      if (err instanceof Error) {
        // Network errors
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
          errorMessage = 'Unable to connect to metrics service. Please check your connection.'
        } else {
          errorMessage = err.message
        }
      }
      
      console.error('❌ Error fetching metrics:', { error: err, message: errorMessage });
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Remove auto-refresh effect

  return {
    metrics,
    refreshMetrics,
    isLoading,
    error
  }
}