#!/bin/bash
# CODAI Setup Script for Unix/Linux
# This provides a user-friendly setup experience

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    color=$1
    message=$2
    echo -e "${color}${message}${NC}"
}

# Welcome message
print_color "$CYAN" "==========================================================="
print_color "$CYAN" "               CODAI Setup Wizard                          "
print_color "$CYAN" "                                                           "
print_color "$CYAN" "  This wizard will set up CODAI on your computer.         "
print_color "$CYAN" "  No coding knowledge required!                           "
print_color "$CYAN" "==========================================================="
echo ""

# Check if running with sudo (not recommended)
if [ "$EUID" -eq 0 ]; then 
    print_color "$YELLOW" "WARNING: Running as root/sudo is not recommended"
    print_color "$YELLOW" "   Some features may not work properly"
    echo ""
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_color "$YELLOW" "Checking your system..."
errors=()

# Check Python
echo -n "  * Python: "
if command_exists python3; then
    python_version=$(python3 --version 2>&1)
    print_color "$GREEN" "[OK] $python_version"
elif command_exists python; then
    python_version=$(python --version 2>&1)
    # Check if it's Python 3
    if [[ $python_version == *"Python 3"* ]]; then
        print_color "$GREEN" "[OK] $python_version"
    else
        print_color "$RED" "[X] Python 2 found, Python 3 required"
        errors+=("Python 3 is required. Please install Python 3.9 or later")
    fi
else
    print_color "$RED" "[X] Not found"
    errors+=("Python is not installed. Please install Python 3.9 or later")
fi

# Check Node.js
echo -n "  * Node.js: "
if command_exists node; then
    node_version=$(node --version)
    print_color "$GREEN" "[OK] version $node_version"
else
    print_color "$RED" "[X] Not found"
    errors+=("Node.js is not installed. Please install Node.js 18 or later")
fi

# Check npm
echo -n "  * npm: "
if command_exists npm; then
    npm_version=$(npm --version)
    print_color "$GREEN" "[OK] version $npm_version"
else
    print_color "$RED" "[X] Not found"
    errors+=("npm is not installed. It usually comes with Node.js")
fi

echo ""

# If there are errors, show them and exit
if [ ${#errors[@]} -gt 0 ]; then
    print_color "$RED" "ERROR: Setup cannot continue. Please fix these issues:"
    echo ""
    for error in "${errors[@]}"; do
        print_color "$RED" "   * $error"
    done
    echo ""
    print_color "$YELLOW" "After installing the missing software, run this setup again."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check for incomplete .venv
if [ -d ".venv" ]; then
    print_color "$YELLOW" "Checking virtual environment..."
    if [ ! -f ".venv/pyvenv.cfg" ]; then
        print_color "$YELLOW" "  WARNING: Found incomplete installation files"
        print_color "$YELLOW" "  Cleaning up..."
        rm -rf .venv
        print_color "$GREEN" "  [OK] Cleanup complete"
        echo ""
    fi
fi

# Function to check if port is in use
check_port() {
    port=$1
    if command_exists lsof; then
        lsof -i :$port >/dev/null 2>&1
    elif command_exists netstat; then
        netstat -an | grep -q ":$port.*LISTEN"
    else
        # Can't check, assume available
        return 1
    fi
}

# Check if ports are available
print_color "$YELLOW" "Checking network ports..."
port_issues=()

# Check backend port (8000)
backend_port=8000
echo -n "  * Port $backend_port (backend): "
if check_port $backend_port; then
    port_issues+=("Port $backend_port (backend) is already in use")
    print_color "$YELLOW" "WARNING: Port $backend_port is in use"
else
    print_color "$GREEN" "[OK] Port $backend_port is available"
fi

# Check frontend port (8001)
frontend_port=8001
echo -n "  * Port $frontend_port (frontend): "
if check_port $frontend_port; then
    port_issues+=("Port $frontend_port (frontend) is already in use")
    print_color "$YELLOW" "WARNING: Port $frontend_port is in use"
else
    print_color "$GREEN" "[OK] Port $frontend_port is available"
fi

echo ""

# If ports are in use, ask user
if [ ${#port_issues[@]} -gt 0 ]; then
    print_color "$YELLOW" "WARNING: Some ports are already in use:"
    for issue in "${port_issues[@]}"; do
        print_color "$YELLOW" "   * $issue"
    done
    echo ""
    print_color "$YELLOW" "This might be from another application or a previous CODAI instance."
    echo ""
    
    read -p "Continue anyway? (Y/n) " response
    if [[ "$response" =~ ^[Nn]$ ]]; then
        echo ""
        print_color "$YELLOW" "Setup cancelled. Please close the applications using these ports and try again."
        echo ""
        read -p "Press Enter to exit..."
        exit 0
    fi
fi

# Ready to install
print_color "$GREEN" "==========================================================="
print_color "$GREEN" "           Ready to install CODAI!                         "
print_color "$GREEN" "==========================================================="
echo ""
echo "This will:"
echo "  1. Install Python packages (may take 5-10 minutes)"
echo "  2. Install frontend packages (may take 2-5 minutes)"
echo "  3. Configure your development environment"
echo ""

read -p "Start installation? (Y/n) " response
if [[ "$response" =~ ^[Nn]$ ]]; then
    echo ""
    print_color "$YELLOW" "Setup cancelled."
    exit 0
fi

echo ""
print_color "$CYAN" "Starting installation..."
echo ""

# Determine Python command
if command_exists python3; then
    PYTHON_CMD="python3"
else
    PYTHON_CMD="python"
fi

# Run Python setup
$PYTHON_CMD -m setup
setup_exit_code=$?

if [ $setup_exit_code -ne 0 ]; then
    echo ""
    print_color "$RED" "ERROR: Setup failed!"
    echo ""
    print_color "$YELLOW" "Please check the error messages above and try again."
    print_color "$YELLOW" "If you need help, please report this issue on GitHub."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""
print_color "$GREEN" "==========================================================="
print_color "$GREEN" "         CODAI Setup Complete!                             "
print_color "$GREEN" "==========================================================="
echo ""
print_color "$GREEN" "CODAI is ready to use!"
echo ""

# Make the script executable for next time
chmod +x setup.sh 2>/dev/null

read -p "Press Enter to close..."