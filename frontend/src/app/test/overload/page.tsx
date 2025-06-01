'use client'

import { useState, useEffect } from 'react'
import { testUtils } from '@/utils/testUtils'

interface TestLogEntry {
  timestamp: string
  type: 'info' | 'error' | 'success'
  message: string
}

export default function OverloadTestPage() {
  const [logs, setLogs] = useState<TestLogEntry[]>([])
  const [isTestingSimple, setIsTestingSimple] = useState(false)
  const [isTestingRetry, setIsTestingRetry] = useState(false)
  
  const addLog = (type: TestLogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString().split('T')[1].split('.')[0],
      type,
      message
    }])
  }

  const clearLogs = () => setLogs([])

  const testSimpleOverload = async () => {
    setIsTestingSimple(true)
    addLog('info', 'Starting simple overload test...')
    
    try {
      const response = await testUtils.triggerOverload()
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
              addLog('error', `Error received: ${JSON.stringify(data.error)}`)
            } else if (data.choices?.[0]?.delta?.content) {
              addLog('info', `Content: ${data.choices[0].delta.content}`)
            }
          }
        }
      }
      
      addLog('success', 'Simple overload test completed')
    } catch (error) {
      addLog('error', `Test failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsTestingSimple(false)
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
                addLog('error', `Retry ${i + 1} failed: ${JSON.stringify(data.error)}`)
                throw new Error('Overloaded')
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
              Overload Error Handler Testing
            </h1>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={testSimpleOverload}
                  disabled={isTestingSimple || isTestingRetry}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {isTestingSimple ? 'Testing...' : 'Test Simple Overload'}
                </button>
                
                <button
                  onClick={testRetryPattern}
                  disabled={isTestingSimple || isTestingRetry}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
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
            <h2 className="text-lg font-medium text-gray-900 mb-2">About This Test Page</h2>
            <p className="text-gray-500 text-sm">
              This page helps test the handling of Anthropic API overload errors. The tests verify:
            </p>
            <ul className="mt-2 list-disc list-inside text-sm text-gray-500 space-y-1">
              <li>Basic overload error detection and formatting</li>
              <li>Retry mechanism with exponential backoff</li>
              <li>User feedback during retries</li>
              <li>Successful recovery after retries</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}