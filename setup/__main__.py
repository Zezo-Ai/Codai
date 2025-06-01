"""
CODAI Setup System

Main entry point for the setup system. Run with:
python -m setup [options]
"""

import sys
from . import cli

# Simple wrapper around the CLI main function
if __name__ == "__main__":
    sys.exit(cli.main())