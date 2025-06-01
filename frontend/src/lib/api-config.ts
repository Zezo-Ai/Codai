/**
 * API configuration that works for both web and Electron
 */

// Check if we're in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && 
    window.process?.type === 'renderer';
};

// Get the API base URL
export const getApiBaseUrl = (): string => {
  // Server-side rendering
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
  }
  
  // Electron runtime - use injected URL
  if (isElectron() && (window as any).ELECTRON_API_BASE) {
    return (window as any).ELECTRON_API_BASE;
  }
  
  // Web browser - use env var or default
  return process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
};

// Export a function instead of constant so it can be dynamic
export const API_BASE_URL = getApiBaseUrl();