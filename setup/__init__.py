"""
CODAI Setup System

A modular setup system for the CODAI application with cross-platform support.
Enhanced with improved logging, resilience, and troubleshooting capabilities.

This package provides modules for:
- Environment detection
- Port and connection management
- System requirements verification
- Backend configuration
- Frontend configuration
- Validation
- Setup orchestration
- Enhanced logging
- Interactive troubleshooting
- Transaction-based resilience

Usage:
    # Run the setup from command line
    python -m setup

    # Or import and use programmatically
    from setup import orchestrator
    orchestrator.run_setup()
"""

import sys
import os
from pathlib import Path

# Setup module root directory
ROOT_DIR = Path(__file__).parent

# Add to python path to ensure modules can be imported
sys.path.insert(0, str(ROOT_DIR.parent))

__version__ = "0.2.0"

# Initialize enhanced logging when module is imported
# Wrap in try-except to handle any initialization errors gracefully
try:
    # Suppress any output during initialization
    import io
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()
    
    try:
        from .logging_config import initialize_logging
        logger = initialize_logging({
            "log_level": os.environ.get("SETUP_LOG_LEVEL", "info"),
            "log_console": False,  # Disable console logging initially
            "log_file": True,
            "log_json": False
        })
        logger.info(f"CODAI Setup System v{__version__} initialized")
    except ImportError:
        # If logging_config is not available, fall back to simple logging
        import logging
        logging.basicConfig(level=logging.INFO, handlers=[logging.FileHandler("setup.log")])
        logger = logging.getLogger("setup")
        logger.info(f"CODAI Setup System v{__version__} initialized with basic logging")
    
finally:
    # Always restore stdout/stderr
    if 'original_stdout' in locals():
        sys.stdout = original_stdout
    if 'original_stderr' in locals():
        sys.stderr = original_stderr

# The actual initialization message will be displayed by the orchestrator in a formatted way