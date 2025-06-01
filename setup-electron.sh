#!/bin/bash
# CODAI Electron Setup Script for Linux/macOS
# Sets up the desktop application

echo "CODAI Electron Desktop Setup"
echo "============================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check prerequisites
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}ERROR: $1 is not installed or not in PATH${NC}"
        echo -e "${YELLOW}Please install $2${NC}"
        exit 1
    fi
}

# Check Node.js
check_command "node" "Node.js from https://nodejs.org/"

# Check npm
check_command "npm" "Node.js from https://nodejs.org/"

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo -e "${RED}ERROR: Python is not installed or not in PATH${NC}"
    echo -e "${YELLOW}Please install Python 3.9+ from https://python.org/${NC}"
    exit 1
fi

echo -e "${GREEN}Prerequisites check passed!${NC}"
echo ""

# Run main setup if .venv doesn't exist
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}Running initial setup...${NC}"
    if [ -f "./setup.sh" ]; then
        bash ./setup.sh
    else
        $PYTHON_CMD -m setup
    fi
    
    if [ $? -ne 0 ]; then
        echo ""
        echo -e "${RED}Initial setup failed!${NC}"
        exit $?
    fi
    echo ""
fi

# Install root Electron dependencies
echo -e "${YELLOW}Installing Electron dependencies...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}Failed to install Electron dependencies!${NC}"
    exit $?
fi

# Check if frontend dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo ""
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    cd ..
    if [ $? -ne 0 ]; then
        echo ""
        echo -e "${RED}Failed to install frontend dependencies!${NC}"
        exit $?
    fi
fi

echo ""
echo -e "${GREEN}============================"
echo "Electron setup completed!"
echo "============================${NC}"
echo ""
echo -e "${CYAN}To run CODAI Desktop:${NC}"
echo ""
echo -e "${YELLOW}  Development mode:${NC}"
echo "    1. Run: $PYTHON_CMD run_server.py (Terminal 1)"
echo "    2. Run: cd frontend && npm run dev:turbo (Terminal 2)"
echo "    3. Run: npm run dev (Terminal 3)"
echo ""
echo "  OR just run: npm run dev (Electron will manage everything)"
echo ""
echo -e "${YELLOW}  Production build:${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "    Run: npm run dist:mac"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "    Run: npm run dist:linux"
else
    echo "    Run: npm run dist"
fi
echo ""