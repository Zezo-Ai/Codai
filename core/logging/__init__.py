"""Logging package initialization."""

from typing import Optional
from pathlib import Path
import shutil
import time

from .manager import LogManager

_log_manager = None

def _clean_log_directory(log_dir: Path) -> None:
    """Clean up a log directory.
    
    Args:
        log_dir: Path to the log directory to clean
    """
    if not log_dir.exists():
        return
        
    try:
        # Remove all files
        for file_path in log_dir.rglob('*.log*'):
            try:
                if file_path.is_file():
                    file_path.unlink()
            except Exception:
                pass
        
        # Remove empty directories
        for dir_path in reversed(list(log_dir.rglob('*'))):
            if dir_path.is_dir():
                try:
                    dir_path.rmdir()
                except Exception:
                    pass
                    
        # Remove root directory if empty
        try:
            log_dir.rmdir()
        except Exception:
            pass
            
    except Exception as e:
        print(f"Warning: Error cleaning logs: {e}")

def initialize_logging(config_path: Optional[str] = None, refresh: bool = False) -> LogManager:
    """Initialize the global logging manager.
    
    Args:
        config_path: Optional path to logging config file
        refresh: Whether to clear all existing logs
        
    Returns:
        LogManager: The global logging manager instance
        
    Note:
        When refresh=True, all existing logs are cleared before setup.
        When refresh=False, existing logs are kept but missing ones are created.
    """
    global _log_manager
    
    # Clean up any existing logging first
    if _log_manager:
        _log_manager.cleanup_logs()
        _log_manager = None
        # Small delay to ensure handles are released
        time.sleep(0.5)
    
    # If refresh is True, clean up log files before creating new manager
    if refresh:
        # Create temporary manager just to get the log directory path
        temp_manager = LogManager(config_path)
        temp_manager.setup()  # Need to setup to get log_dir
        log_dir = temp_manager.log_dir
        temp_manager.cleanup_logs()
        del temp_manager
        
        # Clean up the log directory
        _clean_log_directory(log_dir)
    
    # Now create new manager (no file operations in constructor)
    _log_manager = LogManager(config_path)
    
    # Set up logging infrastructure
    _log_manager.setup()
    
    return _log_manager

def get_logger(name: str, category: str = 'server', subcategory: str = '_base'):
    """Get a logger from the global manager.
    
    Args:
        name: Logger name
        category: Main category (ai, server, tools, security)
        subcategory: Subcategory within the main category
        
    Returns:
        Configured logger instance
    """
    global _log_manager
    if not _log_manager:
        initialize_logging()
    return _log_manager.get_logger(name, category, subcategory)

def cleanup_logging() -> None:
    """Cleanup the global logging manager."""
    global _log_manager
    if _log_manager:
        _log_manager.cleanup_logs()
        _log_manager = None