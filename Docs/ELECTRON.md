# CODAI Electron Documentation

This document consolidates all Electron-related documentation for the CODAI desktop application.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Development Setup](#development-setup)
4. [Building & Distribution](#building--distribution)
5. [Troubleshooting](#troubleshooting)
6. [Recent Fixes](#recent-fixes)

## Overview

The CODAI Electron application provides a desktop wrapper for the web application, enabling:
- Standalone desktop application
- Native OS integration
- Offline-capable operation (with bundled backend)
- Easy distribution without requiring separate server setup

## Architecture

### Project Structure
```
├── electron/
│   ├── main.js          # Main Electron process
│   ├── preload.js       # Preload script for security
│   └── build-python.js  # Python bundling script
├── frontend/            # Next.js application
├── server/              # Python FastAPI backend
└── package.json         # Electron configuration
```

### Key Components
- **Main Process** (`electron/main.js`): Manages application lifecycle, windows, and native APIs
- **Renderer Process**: Runs the Next.js frontend in a Chromium-based web view
- **Python Backend**: FastAPI server bundled with the application
- **IPC Communication**: Secure communication between main and renderer processes

## Development Setup

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+ with Poetry
- Git

### Running in Development

1. **Install dependencies**:
```bash
# Root directory (Electron)
npm install

# Python backend (using Poetry)
poetry install

# Frontend
cd frontend
npm install
```

2. **Run Electron** (manages both frontend and backend):
```bash
npm run dev
```

This will:
- Start Python backend on port 8000 (using Poetry environment)
- Start Next.js frontend on port 8001
- Open Electron window when both are ready

### Alternative: Run Components Separately
```bash
# Terminal 1: Backend
poetry run python run_server.py

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Electron
npm start
```

## Building & Distribution

### Building for Windows

```bash
# Build everything and create installer
npm run dist:win
```

This will:
1. Build Next.js as static files (`output: 'export'`)
2. Bundle Python backend with dependencies
3. Create Windows installer in `dist/` folder

### Build Commands
- `npm run build-frontend` - Build Next.js static export
- `npm run build-python` - Bundle Python with PyInstaller
- `npm run build` - Build both frontend and backend
- `npm run dist` - Build and create installer

### Configuration
Build configuration is in `package.json` under `"build"`:
```json
{
  "build": {
    "appId": "ai.codai.desktop",
    "productName": "CODAI",
    "directories": {
      "output": "dist"
    },
    "files": [
      "electron/**/*",
      "frontend/out/**/*",
      "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}"
    ],
    "win": {
      "target": "nsis",
      "icon": "build-resources/icon.ico"
    }
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "Windows-specific libraries not available"
**Problem**: Python server crashes with pywin32 import error
**Solution**: Install pywin32 in your Python environment
```bash
poetry add pywin32
# or
pip install pywin32
```

#### 2. "Health check error: connect ECONNREFUSED ::1:8000"
**Problem**: Node.js trying to connect via IPv6 instead of IPv4
**Solution**: Already fixed - Electron now uses `127.0.0.1` instead of `localhost`

#### 3. "ERR_CONNECTION_REFUSED" on port 8001
**Problem**: Frontend dev server not running
**Solution**: Already fixed - Electron now automatically starts the frontend server

#### 4. Port conflicts
**Problem**: Servers already running from previous sessions
**Solution**: Kill existing processes
```bash
taskkill /F /IM python.exe
taskkill /F /IM node.exe
```

#### 5. Next.js API routes blocking static export
**Problem**: Next.js can't export statically with API routes
**Solution**: API routes removed from `frontend/src/app/api/`

### Environment-Specific Issues

#### Development Mode
- Electron uses Poetry's Python environment if available
- Hot reload enabled for both frontend and backend
- DevTools automatically open

#### Production Mode
- Uses bundled Python from `resources/` directory
- Static frontend files served from `frontend/out/`
- No hot reload or DevTools

## Recent Fixes

### Port and API URL Fixes
1. **Dynamic Port Support**: Python server now respects `SERVER_PORT` environment variable
2. **IPv4 Enforcement**: All health checks use `127.0.0.1` instead of `localhost`
3. **API URL Injection**: Fixed timing to use `dom-ready` event

### Build Process Fixes
1. **Static Export**: Removed Next.js API routes that blocked static export
2. **Poetry Integration**: Electron detects and uses Poetry environment in development
3. **Frontend Server Management**: Electron automatically starts/stops frontend server

### Windows-Specific Fixes
1. **pywin32 Dependency**: Added to requirements with platform marker
2. **Setup Script**: Updated to check for Windows-specific packages
3. **Shell Execution**: Added `shell: true` for Poetry commands on Windows

## Tips for Development

1. **Use Poetry**: Ensures consistent Python environment
2. **Check Logs**: Both servers output to console in development
3. **Clean Builds**: Delete `dist/` folder before rebuilding
4. **Test Production**: Use `npm run dist:win` then test installer

## Future Improvements

- [ ] Code signing for Windows/macOS
- [ ] Auto-updater integration
- [ ] Splash screen during startup
- [ ] System tray integration
- [ ] Better error handling and recovery