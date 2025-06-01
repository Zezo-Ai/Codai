// Global type declarations for the application

interface Window {
  _screenshotData?: string;
  _DEBUG_LOGS?: boolean;
  
  // Electron dynamic configuration
  ELECTRON_SERVER_PORT?: number;
  NEXT_PUBLIC_API_BASE?: string;
  
  // Electron API exposed via preload script
  electronAPI?: {
    // Server information
    getServerPort: () => Promise<number>;
    getAppInfo: () => Promise<{
      version: string;
      platform: string;
      arch: string;
      electron: string;
      node: string;
      chrome: string;
    }>;
    checkServerHealth: () => Promise<boolean>;
    
    // File operations  
    showSaveDialog: (options: any) => Promise<{ canceled: boolean; filePath?: string }>;
    showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
    
    // App events
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
    
    // Window controls
    window: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
    };
  };
  
  // Electron process type indicator
  process?: {
    type: 'renderer' | 'main';
  };
}