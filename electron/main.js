const { app, BrowserWindow, Menu, shell, ipcMain, dialog, protocol, Tray, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const url = require('url');

// Set app name and ID FIRST before anything else
process.title = 'CODAI';
app.name = 'CODAI';
app.setName('CODAI');

if (process.platform === 'win32') {
  app.setAppUserModelId('ai.codai.desktop');
  // Force Windows to use our app name
  app.setPath('userData', path.join(app.getPath('appData'), 'CODAI'));
}

const isDev = process.env.NODE_ENV === 'development';
const isProd = !isDev;

// Suppress security warnings in development (Next.js needs unsafe-eval for HMR)
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

// Fix GPU issues on Windows
if (process.platform === 'win32') {
  // Use ANGLE with more compatible backend
  app.commandLine.appendSwitch('use-angle', 'd3d9');
  // Disable GPU sandbox to avoid permission issues
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  // Force GPU info collection
  app.commandLine.appendSwitch('enable-gpu-benchmarking');
  // Limit GPU process crashes
  app.commandLine.appendSwitch('gpu-process-max-crashes', '3');
  // Use stable GPU features only
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
}

let mainWindow;
let pythonServer;
let frontendServer;
let tray = null;
let serverPort = 8000;
let frontendPort = 8001;

// Platform-specific Python command
const getPythonCommand = () => {
  if (isDev) {
    return process.platform === 'win32' ? 'python' : 'python3';
  }
  
  // In production, use bundled Python
  const resourcePath = process.resourcesPath;
  if (process.platform === 'win32') {
    return path.join(resourcePath, 'python', 'python.exe');
  } else {
    return path.join(resourcePath, 'python', 'bin', 'python3');
  }
};

// Find available port
async function findAvailablePort(startPort) {
  const net = require('net');
  
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

// Check if server is already running
async function checkExistingServer(port) {
  const http = require('http');
  
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000);
  });
}

// Start Python backend server
async function startPythonServer() {
  try {
    // In development, check if server is already running
    if (isDev) {
      console.log('Checking for existing Python server...');
      const serverRunning = await checkExistingServer(8000);
      
      if (serverRunning) {
        console.log('Python server already running on port 8000');
        serverPort = 8000;
        return; // Don't start a new server
      }
    }
    
    // Find available port
    serverPort = await findAvailablePort(8000);
    console.log(`Starting Python server on port ${serverPort}`);
    
    const pythonPath = getPythonCommand();
    const serverScript = isDev 
      ? path.join(__dirname, '..', 'run_server.py')
      : path.join(process.resourcesPath, 'backend', 'run_server.py');
    
    const env = {
      ...process.env,
      APP_ENV: isProd ? 'production' : 'development',
      ELECTRON_APP: 'true',
      SERVER_PORT: serverPort.toString(),
      // Disable hot reload in production
      SERVER_RELOAD: isDev ? 'true' : 'false',
      // Set paths for bundled backend
      PYTHONPATH: isProd ? path.join(process.resourcesPath, 'backend') : undefined,
      CODAI_CONFIG_PATH: path.join(app.getPath('userData'), 'config')
    };
    
    // Remove undefined values
    Object.keys(env).forEach(key => env[key] === undefined && delete env[key]);
    
    // Check if we should use Poetry
    let command = pythonPath;
    let args = [serverScript];
    
    if (isDev && process.platform === 'win32') {
      // Check if Poetry is available
      try {
        const { execSync } = require('child_process');
        execSync('poetry --version', { cwd: path.join(__dirname, '..') });
        // Poetry is available, use it
        command = 'poetry';
        args = ['run', 'python', serverScript];
        console.log('Using Poetry to run Python server');
      } catch (e) {
        // Poetry not available, use regular Python
        console.log('Poetry not found, using system Python');
      }
    }
    
    pythonServer = spawn(command, args, {
      cwd: isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'backend'),
      env,
      windowsHide: true,
      shell: true  // Required for Poetry on Windows
    });
    
    pythonServer.stdout.on('data', (data) => {
      console.log(`Python server: ${data}`);
      // Only send to renderer if window is ready and page is loaded
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoading() === false) {
        try {
          mainWindow.webContents.send('server-log', data.toString());
        } catch (e) {
          // Ignore errors during window initialization
        }
      }
    });
    
    pythonServer.stderr.on('data', (data) => {
      console.error(`Python server error: ${data}`);
      // Only send to renderer if window is ready and page is loaded
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoading() === false) {
        try {
          mainWindow.webContents.send('server-error', data.toString());
        } catch (e) {
          // Ignore errors during window initialization
        }
      }
    });
    
    pythonServer.on('error', (error) => {
      console.error('Failed to start Python server:', error);
      dialog.showErrorBox('Server Error', `Failed to start backend server: ${error.message}`);
    });
    
    pythonServer.on('close', (code) => {
      console.log(`Python server exited with code ${code}`);
      if (code !== 0 && code !== null && !app.isQuitting) {
        dialog.showErrorBox('Server Crashed', 'The backend server has stopped unexpectedly.');
      }
    });
    
    // Wait for server to be ready
    await waitForServer(serverPort);
    console.log('Python server is ready');
    
  } catch (error) {
    console.error('Error starting Python server:', error);
    dialog.showErrorBox('Startup Error', `Failed to start backend: ${error.message}`);
    app.quit();
  }
}

// Start frontend dev server in development
async function startFrontendServer() {
  if (!isDev) return; // Only needed in development
  
  try {
    // Check if frontend server is already running
    console.log('Checking for existing frontend server...');
    const serverRunning = await checkExistingServer(frontendPort);
    
    if (serverRunning) {
      console.log('Frontend server already running on port 8001');
      return;
    }
    
    console.log('Starting frontend dev server...');
    
    const frontendPath = path.join(__dirname, '..', 'frontend');
    
    // Start Next.js dev server
    frontendServer = spawn('npm', ['run', 'dev'], {
      cwd: frontendPath,
      env: {
        ...process.env,
        PORT: frontendPort.toString(),
        NEXT_PUBLIC_API_BASE: `http://127.0.0.1:${serverPort}`
      },
      shell: true,
      windowsHide: true
    });
    
    frontendServer.stdout.on('data', (data) => {
      console.log(`Frontend server: ${data}`);
    });
    
    frontendServer.stderr.on('data', (data) => {
      console.error(`Frontend server error: ${data}`);
    });
    
    frontendServer.on('error', (error) => {
      console.error('Failed to start frontend server:', error);
      dialog.showErrorBox('Frontend Error', `Failed to start frontend server: ${error.message}`);
    });
    
    frontendServer.on('close', (code) => {
      console.log(`Frontend server exited with code ${code}`);
      if (code !== 0 && code !== null && !app.isQuitting) {
        dialog.showErrorBox('Frontend Crashed', 'The frontend server has stopped unexpectedly.');
      }
    });
    
    // Wait for frontend server to be ready
    await waitForFrontendServer(frontendPort, 30);
    console.log('Frontend server is ready');
    
  } catch (error) {
    console.error('Error starting frontend server:', error);
    dialog.showErrorBox('Frontend Startup Error', `Failed to start frontend: ${error.message}`);
    app.quit();
  }
}

// Wait for frontend server to respond
async function waitForFrontendServer(port, maxAttempts = 30) {
  const http = require('http');
  
  console.log(`Waiting for frontend server to be ready on port ${port}...`);
  
  // Give server time to initialize
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        // For Next.js, check the root path instead of /health
        const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            // Next.js returns 200 for the root path
            if (res.statusCode === 200 || res.statusCode === 304) {
              console.log('Frontend server is responding!');
              resolve();
            } else {
              reject(new Error(`Frontend returned ${res.statusCode}`));
            }
          });
        });
        req.on('error', (err) => {
          // Ignore connection errors during startup
          reject(err);
        });
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error('Frontend check timeout'));
        });
      });
      return; // Server is ready
    } catch (err) {
      // Continue retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Frontend server failed to start after ${maxAttempts} seconds`);
}

// Wait for server to respond
async function waitForServer(port, maxAttempts = 60) {
  const http = require('http');
  
  console.log(`Waiting for server to be ready on port ${port}...`);
  
  // Give server time to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              console.log('Server health check passed!');
              resolve();
            } else {
              reject(new Error(`Server returned ${res.statusCode}`));
            }
          });
        });
        req.on('error', (err) => {
          console.log(`Health check error: ${err.message}`);
          reject(err);
        });
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error('Health check timeout'));
        });
      });
      return; // Server is ready
    } catch (err) {
      if (i % 5 === 0 && i > 0) {
        console.log(`Still waiting for server... (${i}/${maxAttempts})`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Server failed to start after ${maxAttempts} seconds`);
}

// Create system tray
function createTray() {
  // Use the app icon for tray
  const iconPath = isDev 
    ? path.join(__dirname, '..', 'frontend', 'public', 'icon.png')
    : path.join(process.resourcesPath, 'icon.png');
    
  const trayIcon = nativeImage.createFromPath(iconPath);
  
  // Create tray
  tray = new Tray(trayIcon);
  tray.setToolTip('CODAI - Evolved Intelligence');
  
  // Tray context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show CODAI',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Hide CODAI',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Click on tray icon shows/hides window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// Create the main application window
async function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true, // Always enable for security
      allowRunningInsecureContent: false,
      // Additional settings for stability
      backgroundThrottling: false,
      disableBlinkFeatures: 'Auxclick'
    },
    icon: isProd 
      ? path.join(process.resourcesPath, 'build-resources', 'icon.png')
      : path.join(__dirname, '..', 'frontend', 'public', 'icon.png'),
    title: 'CODAI - Evolved Intelligence',
    backgroundColor: '#000000',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    // Enable GPU features with fallback
    webgl: true,
    hardwareAcceleration: true
  });
  
  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);
  
  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setTitle('CODAI - Evolved Intelligence');
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });
  
  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': isDev ? undefined : [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';"
        ]
      }
    });
  });

  // Load the app
  if (isDev) {
    // In development, use Next.js dev server
    mainWindow.loadURL('http://localhost:8001');
  } else {
    // In production, serve static files
    const indexPath = path.join(__dirname, '../frontend/out/index.html');
    mainWindow.loadURL(url.format({
      pathname: indexPath,
      protocol: 'file:',
      slashes: true
    }));
  }
  
  // Inject the API URL into the renderer before page loads
  mainWindow.webContents.on('dom-ready', () => {
    try {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          // Set API base URL globally
          window.ELECTRON_API_BASE = 'http://127.0.0.1:${serverPort}';
          window.NEXT_PUBLIC_API_BASE = 'http://127.0.0.1:${serverPort}';
          
          // Override process.env for Next.js
          if (!window.process) window.process = {};
          if (!window.process.env) window.process.env = {};
          window.process.env.NEXT_PUBLIC_API_BASE = 'http://127.0.0.1:${serverPort}';
          
          // Override fetch to use our API base for relative URLs
          const originalFetch = window.fetch;
          window.fetch = function(url, options) {
            if (typeof url === 'string' && url.startsWith('/')) {
              url = window.ELECTRON_API_BASE + url;
            }
            return originalFetch(url, options);
          };
          
          // Return a simple serializable value
          return 'API URL injected successfully';
        })();
      `).then(result => {
        console.log(result);
      }).catch(err => {
        console.error('Failed to inject API URL:', err);
      });
    } catch (err) {
      console.error('Error in dom-ready handler:', err);
    }
  });
  
  // Handle window close - minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show notification on first minimize
      if (tray && !tray.didNotify) {
        tray.displayBalloon({
          title: 'CODAI',
          content: 'CODAI is still running in the system tray.',
          icon: mainWindow.icon
        });
        tray.didNotify = true;
      }
    }
  });
  
  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Prevent external navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}


// IPC handlers
ipcMain.handle('get-server-port', () => serverPort);
ipcMain.handle('get-api-base', () => `http://127.0.0.1:${serverPort}`);
ipcMain.handle('check-server-health', async () => {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      http.get(`http://127.0.0.1:${serverPort}/health`, (res) => {
        resolve(res.statusCode === 200);
      }).on('error', () => resolve(false));
    });
  } catch {
    return false;
  }
});

// App event handlers
// Handle GPU process crashes
app.on('gpu-process-crashed', (event, killed) => {
  console.error('GPU process crashed, attempting recovery...');
  if (killed) {
    console.error('GPU process was killed');
  }
  // Don't quit, let Electron try to recover
});

// Handle child process crashes
app.on('child-process-gone', (event, details) => {
  console.error('Child process gone:', details);
  if (details.type === 'GPU') {
    console.error('GPU process exited with code:', details.exitCode);
    // Try to continue without crashing the app
  }
});

app.whenReady().then(async () => {
  // Register protocol for serving local files in production
  if (isProd) {
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = request.url.substr(6);
      callback({ path: path.normalize(`${__dirname}/${url}`) });
    });
  }
  
  // Set up Windows Jump List
  if (process.platform === 'win32') {
    app.setJumpList([
      {
        type: 'custom',
        name: 'Recent',
        items: [
          {
            type: 'task',
            title: 'New Chat',
            description: 'Start a new conversation',
            program: process.execPath,
            args: '--new-chat',
            iconPath: process.execPath,
            iconIndex: 0
          }
        ]
      },
      {
        type: 'custom',
        name: 'Tools',
        items: [
          {
            type: 'task',
            title: 'Conversation Inspector',
            description: 'View and manage conversations',
            program: process.execPath,
            args: '--open-inspector',
            iconPath: process.execPath,
            iconIndex: 0
          },
          {
            type: 'task',
            title: 'Analytics',
            description: 'View usage analytics',
            program: process.execPath,
            args: '--open-analytics',
            iconPath: process.execPath,
            iconIndex: 0
          }
        ]
      }
    ]);
  }
  
  // Start backend server first
  await startPythonServer();
  
  // Start frontend server in development
  await startFrontendServer();
  
  // Then create window and tray
  await createWindow();
  createTray();
  
  // Remove application menu
  Menu.setApplicationMenu(null);
  
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  // Clean up Python server
  if (pythonServer && !pythonServer.killed) {
    pythonServer.kill('SIGTERM');
  }
  // Clean up frontend server in development
  if (isDev && frontendServer && !frontendServer.killed) {
    frontendServer.kill('SIGTERM');
  }
  // Clean up tray
  if (tray) {
    tray.destroy();
  }
});

// Handle certificate errors in development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}