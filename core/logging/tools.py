"""Tool-specific logging utilities."""

from typing import Any, Dict, Optional
from . import get_logger

def get_file_edit_logger(name: str):
    """Get logger for file editing operations."""
    return get_logger(name, category='tools', subcategory='file_edit')

def get_computer_logger(name: str):
    """Get logger for computer operations."""
    return get_logger(name, category='tools', subcategory='computer')

def get_browser_logger(name: str):
    """Get logger for browser operations."""
    return get_logger(name, category='tools', subcategory='browser')

def get_system_logger(name: str):
    """Get logger for system operations."""
    return get_logger(name, category='tools', subcategory='system')

def get_package_logger(name: str):
    """Get logger for package operations."""
    return get_logger(name, category='tools', subcategory='packages')

def log_file_operation(logger, operation: str, file_path: str, details: Optional[Dict[str, Any]] = None):
    """Log a file operation with details."""
    logger.info(
        f"File operation: {operation}",
        extra={
            'operation': operation,
            'file_path': file_path,
            'details': details or {}
        }
    )

def log_command_execution(logger, command: str, status: str, output: Optional[str] = None):
    """Log command execution details."""
    logger.info(
        f"Command executed: {command}",
        extra={
            'command': command,
            'status': status,
            'output': output
        }
    )

def log_browser_action(logger, action: str, url: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
    """Log browser-related actions."""
    logger.info(
        f"Browser action: {action}",
        extra={
            'action': action,
            'url': url,
            'details': details or {}
        }
    )

def log_package_operation(logger, operation: str, package: str, version: Optional[str] = None, status: str = 'success'):
    """Log package management operations."""
    logger.info(
        f"Package operation: {operation}",
        extra={
            'operation': operation,
            'package': package,
            'version': version,
            'status': status
        }
    )