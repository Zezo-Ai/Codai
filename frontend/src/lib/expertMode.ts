/**
 * Expert Mode utilities for managing client-side expert mode settings
 */

export const EXPERT_MODE_STORAGE_KEY = 'expertModeEnabled'
const CONFIG_FETCHED_KEY = 'expertModeConfigFetched'

/**
 * Check if expert mode is enabled from server configuration
 * This is now a global setting, not per-user
 */
export function isExpertModeEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false // Default to disabled on server-side
  }
  
  // Check if we have a cached server config
  const cachedConfig = localStorage.getItem('serverExpertModeConfig')
  if (cachedConfig) {
    try {
      const config = JSON.parse(cachedConfig)
      return config.enabled || false
    } catch {
      // If parsing fails, fetch fresh config
      fetchServerConfig()
      return false
    }
  }
  
  // If no cached config, fetch from server
  fetchServerConfig()
  return false // Default to disabled while fetching
}

/**
 * Fetch server configuration for expert mode
 */
async function fetchServerConfig(): Promise<void> {
  try {
    const { api } = await import('./api')
    const result = await api.chat.getConfig()
    const serverEnabled = result.data?.expert_mode?.enabled || false
    
    // Cache the server config
    localStorage.setItem('serverExpertModeConfig', JSON.stringify({
      enabled: serverEnabled,
      fetchedAt: Date.now()
    }))
    
    // Dispatch event to notify components of config change
    window.dispatchEvent(new CustomEvent('expertModeConfigLoaded', { 
      detail: { serverEnabled } 
    }))
  } catch (error) {
    console.warn('Failed to fetch expert mode config:', error)
  }
}

/**
 * Set expert mode enabled state - now updates server config
 * @deprecated Use the settings menu API instead
 */
export function setExpertModeEnabled(enabled: boolean): void {
  console.warn('setExpertModeEnabled is deprecated. Use the settings menu to update server configuration.')
}

/**
 * Initialize expert mode with server configuration
 * Should be called on app startup
 */
export async function initializeExpertMode(): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }
  
  // Check if we need to refresh cached config (e.g., every hour)
  const cachedConfig = localStorage.getItem('serverExpertModeConfig')
  if (cachedConfig) {
    try {
      const config = JSON.parse(cachedConfig)
      const hourAgo = Date.now() - (60 * 60 * 1000)
      if (config.fetchedAt && config.fetchedAt > hourAgo) {
        return // Config is fresh, no need to refetch
      }
    } catch {
      // If parsing fails, fetch fresh config
    }
  }
  
  await fetchServerConfig()
}

/**
 * Listen for expert mode changes across tabs/windows
 */
export function onExpertModeChange(callback: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {} // No cleanup needed on server-side
  }
  
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === EXPERT_MODE_STORAGE_KEY && e.newValue !== null) {
      try {
        const enabled = JSON.parse(e.newValue)
        callback(enabled)
      } catch {
        // Ignore parsing errors
      }
    }
  }
  
  window.addEventListener('storage', handleStorageChange)
  
  return () => {
    window.removeEventListener('storage', handleStorageChange)
  }
}