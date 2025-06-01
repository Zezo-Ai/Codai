/**
 * Storage utilities for safe localStorage access
 */

/**
 * Safely get a value from localStorage
 * @param key The storage key
 * @returns The stored value or null if not available
 */
export const getFromStorage = (key: string): string | null => {
  if (typeof window === 'undefined') return null
  
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.warn(`Failed to read from localStorage: ${key}`, error)
    return null
  }
}

/**
 * Safely set a value in localStorage
 * @param key The storage key
 * @param value The value to store
 */
export const setInStorage = (key: string, value: string): void => {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(key, value)
  } catch (error) {
    console.warn(`Failed to write to localStorage: ${key}`, error)
  }
}

/**
 * Safely remove a value from localStorage
 * @param key The storage key
 */
export const removeFromStorage = (key: string): void => {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.warn(`Failed to remove from localStorage: ${key}`, error)
  }
}

/**
 * Check if localStorage is available
 * @returns True if localStorage is available
 */
export const isStorageAvailable = (): boolean => {
  if (typeof window === 'undefined') return false
  
  try {
    const testKey = '__storage_test__'
    localStorage.setItem(testKey, 'test')
    localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}