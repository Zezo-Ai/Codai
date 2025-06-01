@echo off
:: CODAI Electron Setup Script for Windows
:: Sets up the desktop application

echo CODAI Electron Desktop Setup
echo ============================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.9+ from https://python.org/
    pause
    exit /b 1
)

echo Prerequisites check passed!
echo.

:: Run the main setup first if .venv doesn't exist
if not exist ".venv" (
    echo Running initial setup...
    call setup.bat
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo Initial setup failed!
        pause
        exit /b %ERRORLEVEL%
    )
    echo.
)

:: Install root Electron dependencies
echo Installing Electron dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Failed to install Electron dependencies!
    pause
    exit /b %ERRORLEVEL%
)

:: Check if frontend dependencies are installed
if not exist "frontend\node_modules" (
    echo.
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo Failed to install frontend dependencies!
        pause
        exit /b %ERRORLEVEL%
    )
)

echo.
echo ============================
echo Electron setup completed!
echo ============================
echo.
echo To run CODAI Desktop:
echo.
echo   Development mode:
echo     1. Run: python run_server.py (Terminal 1)
echo     2. Run: cd frontend && npm run dev:turbo (Terminal 2)
echo     3. Run: npm run dev (Terminal 3)
echo.
echo   OR just run: npm run dev (Electron will manage everything)
echo.
echo   Production build:
echo     Run: npm run dist:win
echo.
pause