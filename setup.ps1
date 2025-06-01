# CODAI Setup Script for Windows (PowerShell)
# This provides a more user-friendly experience than the batch file

# Set UTF-8 encoding for proper display of special characters
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
chcp 65001 | Out-Null

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "               CODAI Setup Wizard                         " -ForegroundColor Cyan  
Write-Host "                                                          " -ForegroundColor Cyan
Write-Host "  This wizard will set up CODAI on your computer.        " -ForegroundColor Cyan
Write-Host "  No coding knowledge required!                          " -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator (recommended)
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "WARNING: Running without administrator privileges" -ForegroundColor Yellow
    Write-Host "   Some features may not work properly" -ForegroundColor Yellow
    Write-Host ""
}

# Function to check if a command exists
function Test-Command {
    param($Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Check prerequisites
Write-Host "Checking your system..." -ForegroundColor Yellow
$errors = @()

# Check Python
Write-Host -NoNewline "  * Python: "
if (Test-Command python) {
    $pythonVersion = python --version 2>&1
    Write-Host "[OK] $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "[X] Not found" -ForegroundColor Red
    $errors += "Python is not installed. Please install Python 3.9 or later from python.org"
}

# Check Node.js
Write-Host -NoNewline "  * Node.js: "
if (Test-Command node) {
    $nodeVersion = node --version
    Write-Host "[OK] version $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "[X] Not found" -ForegroundColor Red
    $errors += "Node.js is not installed. Please install Node.js 18 or later from nodejs.org"
}

# Check npm
Write-Host -NoNewline "  * npm: "
if (Test-Command npm) {
    $npmVersion = npm --version
    Write-Host "[OK] version $npmVersion" -ForegroundColor Green
} else {
    Write-Host "[X] Not found" -ForegroundColor Red
    $errors += "npm is not installed. It usually comes with Node.js"
}

Write-Host ""

# If there are errors, show them and exit
if ($errors.Count -gt 0) {
    Write-Host "ERROR: Setup cannot continue. Please fix these issues:" -ForegroundColor Red
    Write-Host ""
    foreach ($error in $errors) {
        Write-Host "   * $error" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "After installing the missing software, run this setup again." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Check for incomplete .venv
if (Test-Path .venv) {
    Write-Host "Checking virtual environment..." -ForegroundColor Yellow
    if (-not (Test-Path .venv\pyvenv.cfg)) {
        Write-Host "  WARNING: Found incomplete installation files" -ForegroundColor Yellow
        Write-Host "  Cleaning up..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
        Write-Host "  [OK] Cleanup complete" -ForegroundColor Green
        Write-Host ""
    }
}

# Check if ports are available
Write-Host "Checking network ports..." -ForegroundColor Yellow
$portIssues = @()

# Check backend port (8000)
$backendPort = 8000
$tcp = New-Object System.Net.Sockets.TcpClient
try {
    $tcp.Connect("127.0.0.1", $backendPort)
    $tcp.Close()
    $portIssues += "Port $backendPort (backend) is already in use"
    Write-Host "  WARNING: Port $backendPort is in use" -ForegroundColor Yellow
} catch {
    Write-Host "  [OK] Port $backendPort is available" -ForegroundColor Green
}

# Check frontend port (8001)
$frontendPort = 8001
$tcp = New-Object System.Net.Sockets.TcpClient
try {
    $tcp.Connect("127.0.0.1", $frontendPort)
    $tcp.Close()
    $portIssues += "Port $frontendPort (frontend) is already in use"
    Write-Host "  WARNING: Port $frontendPort is in use" -ForegroundColor Yellow
} catch {
    Write-Host "  [OK] Port $frontendPort is available" -ForegroundColor Green
}

Write-Host ""

# If ports are in use, ask user
if ($portIssues.Count -gt 0) {
    Write-Host "WARNING: Some ports are already in use:" -ForegroundColor Yellow
    foreach ($issue in $portIssues) {
        Write-Host "   * $issue" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "This might be from another application or a previous CODAI instance." -ForegroundColor Yellow
    Write-Host ""
    
    $response = Read-Host "Continue anyway? (Y/n)"
    if ($response -eq 'n' -or $response -eq 'N') {
        Write-Host ""
        Write-Host "Setup cancelled. Please close the applications using these ports and try again." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 0
    }
}

# Ready to install
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "           Ready to install CODAI!                        " -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "This will:"
Write-Host "  1. Install Python packages (may take 5-10 minutes)"
Write-Host "  2. Install frontend packages (may take 2-5 minutes)"
Write-Host "  3. Configure your development environment"
Write-Host ""

$response = Read-Host "Start installation? (Y/n)"
if ($response -eq 'n' -or $response -eq 'N') {
    Write-Host ""
    Write-Host "Setup cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Starting installation..." -ForegroundColor Cyan
Write-Host ""

# Run Python setup
try {
    python -m setup
    if ($LASTEXITCODE -ne 0) {
        throw "Setup failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host ""
    Write-Host "ERROR: Setup failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the error messages above and try again." -ForegroundColor Yellow
    Write-Host "If you need help, please report this issue on GitHub." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "         CODAI Setup Complete!                            " -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "CODAI is ready to use!" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")