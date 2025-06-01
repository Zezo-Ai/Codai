# CODAI Electron Setup Script for Windows (PowerShell)
# Sets up the desktop application

Write-Host "CODAI Electron Desktop Setup" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator (optional, not required)
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if ($isAdmin) {
    Write-Host "Running with administrator privileges" -ForegroundColor Green
} else {
    Write-Host "Running without administrator privileges" -ForegroundColor Yellow
}
Write-Host ""

# Check prerequisites
function Test-Command {
    param($Command)
    try {
        if (Get-Command $Command -ErrorAction Stop) {
            return $true
        }
    } catch {
        return $false
    }
}

# Check Node.js
if (-not (Test-Command "node")) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check npm
if (-not (Test-Command "npm")) {
    Write-Host "ERROR: npm is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check Python
if (-not (Test-Command "python")) {
    Write-Host "ERROR: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3.9+ from https://python.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Prerequisites check passed!" -ForegroundColor Green
Write-Host ""

# Run main setup if .venv doesn't exist
if (-not (Test-Path ".venv")) {
    Write-Host "Running initial setup..." -ForegroundColor Yellow
    & ".\setup.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Initial setup failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit $LASTEXITCODE
    }
    Write-Host ""
}

# Install root Electron dependencies
Write-Host "Installing Electron dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Failed to install Electron dependencies!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit $LASTEXITCODE
}

# Check if frontend dependencies are installed
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host ""
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location frontend
    npm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Failed to install frontend dependencies!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "============================" -ForegroundColor Green
Write-Host "Electron setup completed!" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green
Write-Host ""
Write-Host "To run CODAI Desktop:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Development mode:" -ForegroundColor Yellow
Write-Host "    1. Run: python run_server.py (Terminal 1)"
Write-Host "    2. Run: cd frontend && npm run dev:turbo (Terminal 2)"
Write-Host "    3. Run: npm run dev (Terminal 3)"
Write-Host ""
Write-Host "  OR just run: npm run dev (Electron will manage everything)"
Write-Host ""
Write-Host "  Production build:" -ForegroundColor Yellow
Write-Host "    Run: npm run dist:win"
Write-Host ""
Read-Host "Press Enter to exit"