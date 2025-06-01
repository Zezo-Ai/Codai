'use client'

import React, { useState } from 'react'
import { Key, Eye, EyeOff, Check, X, AlertCircle, Loader2, Lock, ArrowRight } from 'lucide-react'
import { useApiKey } from '@/hooks/useApiKey'

interface ApiKeySettingsProps {
  onSuccess?: () => void
}

export function ApiKeySettings({ onSuccess }: ApiKeySettingsProps = {}) {
  const {
    maskedKey,
    hasApiKey,
    isValidating,
    isValid,
    error,
    setApiKey,
    clearApiKey,
    testApiKey,
  } = useApiKey()

  const [inputValue, setInputValue] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!inputValue.trim()) return

    setIsSaving(true)
    try {
      await setApiKey(inputValue)
      setInputValue('') // Clear input on success
      // Automatically test the key after saving
      const testResult = await testApiKey()
      // If test fails, the error will be shown
      // If test succeeds, the continue button will appear
    } catch (err) {
      // Error is handled by the hook
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    const result = await testApiKey()
    // If test is successful and we have a success callback, show the continue button
    // The button will appear automatically due to isValid state change
  }

  const handleClear = () => {
    if (window.confirm('Are you sure you want to remove your API key?')) {
      clearApiKey()
      setInputValue('')
    }
  }

  const isInputValid = inputValue.startsWith('sk-ant-') && inputValue.length > 20

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Lock className="h-4 w-4 text-gray-500 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="text-sm font-medium text-gray-900">Anthropic API Key</h4>
            <p className="text-xs text-gray-500 mt-1">
              Your API key is encrypted and stored securely in your browser session.
              It will be cleared when you close your browser.
            </p>
          </div>

          {/* Current Key Display */}
          {hasApiKey && maskedKey && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-gray-700">{maskedKey}</span>
                <div className="flex items-center gap-2">
                  {isValid === true && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <Check className="h-3 w-3" />
                      Valid
                    </span>
                  )}
                  {isValid === false && (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <X className="h-3 w-3" />
                      Invalid
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleTest}
                  disabled={isValidating}
                  className="text-xs px-2 py-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-50"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </button>
                <button
                  onClick={handleClear}
                  className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  Remove Key
                </button>
              </div>
              
              {/* Success message and continue button */}
              {isValid === true && onSuccess && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg space-y-2">
                  <p className="text-sm text-green-700 font-medium">
                    ✓ API key validated successfully!
                  </p>
                  <button
                    onClick={onSuccess}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Continue to Chat
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Key Input */}
          {!hasApiKey && (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Validation Indicator */}
              {inputValue && (
                <div className="flex items-center gap-2 text-xs">
                  {isInputValid ? (
                    <>
                      <Check className="h-3 w-3 text-green-500" />
                      <span className="text-green-600">Valid format</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 text-yellow-500" />
                      <span className="text-yellow-600">Key must start with "sk-ant-"</span>
                    </>
                  )}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={!isInputValid || isSaving}
                className="w-full px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save API Key'
                )}
              </button>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* Help Text */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>
              Get your API key from the{' '}
              <a
                href="https://console.anthropic.com/account/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                Anthropic Console
              </a>
            </p>
            <p>• Your key is never sent to our servers</p>
            <p>• Encrypted locally in your browser</p>
            <p>• Cleared when you close your browser</p>
          </div>
        </div>
      </div>
    </div>
  )
}