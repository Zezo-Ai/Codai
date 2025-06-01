@echo off
:: CODAI Setup Script for Windows
:: Handles incomplete virtual environments and runs setup

:: Set UTF-8 encoding for proper character display
chcp 65001 >nul 2>&1

echo CODAI Setup Script
echo ==================
echo.

:: Check if .venv exists
if exist ".venv" (
    echo Checking virtual environment...
    if not exist ".venv\pyvenv.cfg" (
        echo Incomplete virtual environment detected!
        echo Removing .venv folder...
        rmdir /s /q .venv 2>nul
        if exist ".venv" (
            echo Failed to remove .venv folder. Please delete it manually.
            pause
            exit /b 1
        )
        echo Successfully removed incomplete virtual environment.
        echo.
    ) else (
        echo Virtual environment appears complete.
        echo.
    )
)

:: Run the setup
echo Starting CODAI setup...
echo.
python -m setup %*

:: Check if setup was successful
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Setup failed with error code %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Setup completed successfully!
pause