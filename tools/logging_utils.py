"""Logging utilities for tools."""
from pathlib import Path
from typing import Optional
from functools import wraps
from core.logging import get_logger

class PathActionLogger:
    """Logger for path and folder related actions."""
    
    def __init__(self):
        # Get specialized loggers using new logging interface
        self.base_logger = get_logger("tools.main", "tools", "_base")  # Base tool logging
        self.error_logger = get_logger("tools.errors", "tools", "_base")  # Base error logging
        # Specialized loggers
        self.edit_logger = get_logger("file_edits", "tools", "file_edit")  # File editing specific
        self.system_logger = get_logger("file_system", "tools", "system")  # System operations
    
    def log_folder_action(self, action: str, path: Path, status: str, details: Optional[str] = None):
        """Log folder-related actions."""
        message = f"Folder {action}: {path} - Status: {status}"
        if details:
            message += f" - Details: {details}"
            
        if status == "Failed":
            self.error_logger.error(message)
        else:
            self.system_logger.info(message)

    def log_path_action(self, action: str, path: Path, command: Optional[str] = None,
                       status: str = "Success", error: Optional[str] = None,
                       details: Optional[str] = None):
        """Log path-related actions."""
        message = f"Path {action}: {path}"
        if command:
            message += f" - Command: {command}"
        if details:
            message += f" - Details: {details}"
        message += f" - Status: {status}"
        
        if error:
            message += f" - Error: {error}"
            self.error_logger.error(message)
        elif action in ["edit", "str_replace", "insert"]:
            self.edit_logger.info(message)
        else:
            self.system_logger.info(message)

def log_path_operation(operation: str):
    """Decorator for logging path operations."""
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            path = kwargs.get('path') or (args[0] if args else None)
            command = kwargs.get('command')
            logger = PathActionLogger()
            
            try:
                result = func(self, *args, **kwargs)
                logger.log_path_action(operation, path, command)
                return result
            except Exception as e:
                logger.log_path_action(operation, path, command, "Failed", str(e))
                raise
            
        return wrapper
    return decorator

def log_folder_operation(operation: str):
    """Decorator for logging folder operations."""
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            path = kwargs.get('path') or (args[0] if args else None)
            logger = PathActionLogger()
            
            try:
                result = func(self, *args, **kwargs)
                logger.log_folder_action(operation, path, "Success")
                return result
            except Exception as e:
                logger.log_folder_action(operation, path, "Failed", str(e))
                raise
            
        return wrapper
    return decorator