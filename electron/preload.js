const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Server information
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkServerHealth: () => ipcRenderer.invoke('check-server-health'),
  
  // File operations
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // App events
  on: (channel, callback) => {
    const validChannels = [
      'new-session',
      'export-session', 
      'import-session',
      'navigate',
      'show-server-logs',
      'server-log',
      'server-error'
    ];
    
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  },
  
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'), 
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized')
  }
});

// Add process type indicator for Electron detection
window.process = {
  type: 'renderer'
};