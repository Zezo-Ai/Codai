'use client'

import { useState } from 'react'
import { testUtils, AnthropicErrorType } from '@/utils/testUtils'

interface TestLogEntry {
  timestamp: string
  type: 'info' | 'error' | 'success'
  message: string
}

const ERROR_DESCRIPTIONS: Record<AnthropicErrorType, string> = {
  overloaded: 'System overload - too many requests being processed',
  rate_limit: 'Rate limit exceeded - too many requests per minute',
  context_length: 'Input exceeds maximum context length',
  content_filter: 'Content violates safety policies',
  model_unavailable: 'Requested model is temporarily unavailable',
  invalid_request: 'Invalid or malformed request',
  internal_error: 'Internal server error',
  timeout: 'Request timeout',
  token_limit: 'Response would exceed token limit'
}

export default function ErrorTestPage() {
  const [logs, setLogs] = useState<TestLogEntry[]>([])
  const [isTestingError, setIsTestingError] = useState(false)
  const [isTestingRetry, setIsTestingRetry] = useState(false)
  const [selectedError, setSelectedError] = useState<AnthropicErrorType>('overloaded')
  
  const addLog = (type: TestLogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString().split('T')[1].split('.')[0],
      type,
      message
    }])
  }

  const clearLogs = () => setLogs([])

  const testError = async (errorType: AnthropicErrorType) => {
    setIsTestingError(true)
    addLog('info', `Starting ${errorType} error test...`)
    
    try {
      const response = await testUtils.testError(errorType)
      const reader = response.body?.getReader()
      
      if (!reader) {
        throw new Error('No response body')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        // Parse SSE data
        const text = new TextDecoder().decode(value)
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(5))
            if (data.type === 'error') {
              addLog('error', `Error received: ${JSON.stringify(data.error, null, 2)}`)
            } else if (data.choices?.[0]?.delta?.content) {
              addLog('info', `Content: ${data.choices[0].delta.content}`)
            }
          }
        }
      }
      
      addLog('success', `${errorType} error test completed`)
    } catch (error) {
      addLog('error', `Test failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsTestingError(false)
    }
  }

  const testRetryPattern = async () => {
    setIsTestingRetry(true)
    addLog('info', 'Starting retry pattern test...')
    
    for (let i = 0; i < 3; i++) {
      try {
        addLog('info', `Attempt ${i + 1}...`)
        const response = await testUtils.testRetryPattern(i)
        const reader = response.body?.getReader()
        
        if (!reader) {
          throw new Error('No response body')
        }

        let success = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const text = new TextDecoder().decode(value)
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(5))
              if (data.type === 'error') {
                addLog('error', `Retry ${i + 1} failed: ${JSON.stringify(data.error, null, 2)}`)
                throw new Error('Error response')
              } else if (data.choices?.[0]?.delta?.content) {
                addLog('info', `Content: ${data.choices[0].delta.content}`)
                success = true
              }
            }
          }
        }
        
        if (success) {
          addLog('success', `Success after ${i + 1} retries`)
          break
        }
      } catch (error) {
        if (i < 2) {
          const backoff = Math.pow(2, i)
          addLog('info', `Waiting ${backoff}s before retry...`)
          await new Promise(resolve => setTimeout(resolve, backoff * 1000))
        } else {
          addLog('error', 'Max retries reached')
        }
      }
    }
    
    setIsTestingRetry(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h1 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              API Error Handler Testing
            </h1>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="error-type" className="block text-sm font-medium text-gray-700">
                    Select Error Type
                  </label>
                  <select
                    id="error-type"
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    value={selectedError}
                    onChange={(e) => setSelectedError(e.target.value as AnthropicErrorType)}
                    disabled={isTestingError || isTestingRetry}
                  >
                    {Object.entries(ERROR_DESCRIPTIONS).map(([key, description]) => (
                      <option key={key} value={key}>{key} - {description}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => testError(selectedError)}
                    disabled={isTestingError || isTestingRetry}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {isTestingError ? 'Testing...' : 'Test Selected Error'}
                  </button>
                  
                  <button
                    onClick={testRetryPattern}
                    disabled={isTestingError || isTestingRetry}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {isTestingRetry ? 'Testing...' : 'Test Retry Pattern'}
                  </button>

                  <button
                    onClick={clearLogs}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Clear Logs
                  </button>
                </div>
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Test Logs</h3>
                <div className="bg-black rounded-lg p-4 h-96 overflow-auto font-mono text-sm">
                  {logs.map((log, index) => (
                    <div 
                      key={index}
                      className={`
                        ${log.type === 'error' ? 'text-red-400' : 
                          log.type === 'success' ? 'text-green-400' : 
                          'text-gray-300'}
                      `}
                    >
                      <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div className="text-gray-500 italic">No logs yet. Run a test to see results.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-2">About API Errors</h2>
            <p className="text-gray-500 text-sm">
              This page helps test handling of various Anthropic API errors and response patterns:
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(ERROR_DESCRIPTIONS).map(([key, description]) => (
                <div key={key} className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-900">{key}</h3>
                  <p className="mt-1 text-sm text-gray-500">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}