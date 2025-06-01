"""Logging initialization utilities."""

from typing import Optional
from .manager import LogManager
import shutil
from pathlib import Path

def ensure_logging_setup(manager: LogManager, refresh: bool = False) -> None:
    """Ensure logging is properly set up.
    
    Args:
        manager: The LogManager instance to set up
        refresh: Whether to refresh log files (now handled earlier)
    """
    # Call setup explicitly after any potential cleanup
    manager.setup()