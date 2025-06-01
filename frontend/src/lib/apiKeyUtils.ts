/**
 * Utility functions for API key display
 */

/**
 * Mask an API key for display
 * Shows format: sk-ant-***...****
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) return apiKey
  
  const start = apiKey.substring(0, 7) // "sk-ant-"
  const end = apiKey.substring(apiKey.length - 4)
  const masked = '*'.repeat(Math.min(apiKey.length - 11, 20)) // Limit mask length
  
  return `${start}${masked}${end}`
}