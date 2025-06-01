# CODAI Setup Guide

This guide provides all available setup methods for CODAI across different platforms.

## Setup Methods Overview

### 🪟 Windows Users

1. **PowerShell Setup (Recommended)**
   ```powershell
   .\setup.ps1
   ```
   - User-friendly wizard interface
   - Colored output and progress indicators
   - System prerequisite checks
   - Port availability verification
   - Automatic cleanup of incomplete installations

2. **Command Prompt (Batch File)**
   ```cmd
   setup.bat
   ```
   - Simple batch file setup
   - Works in standard Command Prompt

3. **Python Module**
   ```bash
   python -m setup
   ```
   - Direct Python setup module
   - Cross-platform compatible

### 🐧 Linux/macOS Users

1. **Bash Setup Script (Recommended)**
   ```bash
   ./setup.sh
   ```
   - User-friendly wizard interface
   - Colored output and progress indicators
   - System prerequisite checks
   - Port availability verification
   - Automatic cleanup of incomplete installations

2. **Python Module**
   ```bash
   python -m setup
   ```
   - Direct Python setup module
   - Cross-platform compatible

## Advanced Setup Options

### Partial Setup
```bash
# Backend only
python -m setup setup --skip-frontend

# Frontend only
python -m setup setup --skip-backend
```

### Troubleshooting Setup
```bash
# Check system requirements
python -m setup check

# Validate environment
python -m setup validation

# View all setup commands
python -m setup --help
```

## What Setup Does

All setup methods perform these tasks:

1. **System Checks**
   - Verifies Python 3.9+ is installed
   - Verifies Node.js 18+ is installed
   - Checks npm availability

2. **Environment Setup**
   - Creates Python virtual environment
   - Installs Python dependencies via Poetry
   - Installs frontend npm packages

3. **Configuration**
   - Creates necessary configuration files
   - Sets up environment variables
   - Configures port settings

4. **Validation**
   - Verifies all installations completed
   - Checks port availability (8000, 8001)
   - Validates API configurations

## Prerequisites

Before running any setup method, ensure you have:

- **Python 3.9 or later** - [Download](https://www.python.org/downloads/)
- **Node.js 18 or later** - [Download](https://nodejs.org/)
- **Git** - [Download](https://git-scm.com/)
- **Anthropic API Key** - Required for Claude integration

## Post-Setup

After successful setup:

1. **Set your API key**:
   ```bash
   # Windows
   set ANTHROPIC_API_KEY=your-key-here
   
   # Linux/macOS
   export ANTHROPIC_API_KEY=your-key-here
   ```

2. **Start the backend**:
   ```bash
   python run_server.py
   ```

3. **Start the frontend** (in a new terminal):
   ```bash
   cd frontend
   npm run dev
   ```

4. **Access CODAI**:
   Open http://localhost:8001 in your browser

## Troubleshooting

### Port Already in Use
If ports 8000 or 8001 are in use:
1. The setup scripts will warn you
2. You can continue anyway (if it's another CODAI instance)
3. Or close the conflicting application first

### Missing Prerequisites
The setup scripts will clearly indicate which prerequisites are missing and provide download links.

### Permission Issues
- **Windows**: Run PowerShell as Administrator if needed
- **Linux/macOS**: Don't use sudo; the scripts will set correct permissions

## Need Help?

- Check the [documentation](./Docs/New/README.md)
- Report issues on [GitHub](https://github.com/your-repo/issues)
- Review [CLAUDE.md](./CLAUDE.md) for development guidelines