'use client'

import React from 'react'
import { Key, Settings, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ApiKeyPromptProps {
  onOpenSettings?: () => void
}

export function ApiKeyPrompt({ onOpenSettings }: ApiKeyPromptProps) {
  const router = useRouter()

  const handleSettingsClick = () => {
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      // If no settings handler provided, try to find and click the settings button
      const settingsButton = document.querySelector('[aria-label="Settings"]')
      if (settingsButton instanceof HTMLElement) {
        settingsButton.click()
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto my-8 p-6">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-indigo-100 rounded-full">
            <Key className="h-6 w-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">API Key Required</h2>
        </div>
        
        <p className="text-gray-700 mb-6">
          To use CODAI, you need to provide your Anthropic API key. Your key is encrypted and stored securely.
        </p>

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="mt-1 text-indigo-600">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Secure Storage</p>
              <p className="text-sm text-gray-600">Your key is encrypted and stored in our secure database</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="mt-1 text-indigo-600">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Never Exposed</p>
              <p className="text-sm text-gray-600">Your key never leaves our servers or appears in logs</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="mt-1 text-indigo-600">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Easy Management</p>
              <p className="text-sm text-gray-600">Update or remove your key anytime from Settings</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleSettingsClick}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            <Settings className="h-5 w-5" />
            Open Settings to Add API Key
          </button>
          
          <a
            href="https://console.anthropic.com/account/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
          >
            <ExternalLink className="h-5 w-5" />
            Get API Key
          </a>
        </div>
        
        <p className="text-xs text-gray-500 mt-4 text-center">
          Don't have an API key? Sign up at{' '}
          <a
            href="https://www.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline"
          >
            anthropic.com
          </a>
        </p>
      </div>
    </div>
  )
}