"""
Enhanced Logging Configuration

Provides a robust and configurable logging system for the setup process.
Features:
- Multi-level logging (debug, info, warning, error)
- File and console output
- Contextual information
- Structured logs for analysis
"""

import os
import sys
import logging
import datetime
import platform
import json
from pathlib import Path
from typing import Dict, Any, Optional, Union

# Initialize logging constants
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

LOG_FILENAME = f"setup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
LOG_FILEPATH = LOG_DIR / LOG_FILENAME

# JSON logger for structured logging
try:
    from pythonjsonlogger import jsonlogger
    JSON_LOGGER_AVAILABLE = True
except ImportError:
    JSON_LOGGER_AVAILABLE = False

# Set up log levels
LOG_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL
}


class ContextFilter(logging.Filter):
    """Add contextual information to log records."""
    
    def __init__(self, context=None):
        super().__init__()
        self.context = context or {}
    
    def filter(self, record):
        # Add context to the record
        for key, value in self.context.items():
            setattr(record, key, value)
        
        # Add system information
        record.hostname = platform.node()
        record.platform = platform.system()
        record.python_version = platform.python_version()
        
        return True


class StructuredLogFormatter(logging.Formatter):
    """Format logs in a structured way for better analysis."""
    
    def format(self, record):
        # Create a structured log entry
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "path": record.pathname,
        }
        
        # Add exception info if available
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        # Add any extra attributes from ContextFilter
        for attr in dir(record):
            if attr.startswith("_") or attr in log_entry or not hasattr(record, attr):
                continue
            try:
                value = getattr(record, attr)
                # Only include serializable values
                if isinstance(value, (str, int, float, bool, list, dict, tuple)) or value is None:
                    log_entry[attr] = value
            except Exception:
                pass
        
        return json.dumps(log_entry)


def configure_logging(level: str = "info", 
                      console: bool = True, 
                      file: bool = True, 
                      json_format: bool = False,
                      context: Optional[Dict[str, Any]] = None,
                      console_format: Optional[str] = None) -> logging.Logger:
    """
    Configure the logging system.
    
    Args:
        level: Log level (debug, info, warning, error, critical)
        console: Whether to log to console
        file: Whether to log to file
        json_format: Whether to use JSON format for logs
        context: Optional context dictionary to add to all logs
    
    Returns:
        Configured root logger
    """
    # Get the log level
    log_level = LOG_LEVELS.get(level.lower(), logging.INFO)
    
    # Create a root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Clear existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create formatters
    if json_format and JSON_LOGGER_AVAILABLE:
        log_format = '%(timestamp)s %(level)s %(name)s %(message)s'
        formatter = jsonlogger.JsonFormatter(log_format)
    elif json_format:
        formatter = StructuredLogFormatter()
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    # Add context filter
    context_filter = ContextFilter(context)
    root_logger.addFilter(context_filter)
    
    # Console handler with simpler format if specified
    if console:
        console_handler = logging.StreamHandler(sys.stdout)
        if console_format:
            console_formatter = logging.Formatter(console_format)
            console_handler.setFormatter(console_formatter)
        else:
            console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)
    
    # File handler
    if file:
        file_handler = logging.FileHandler(LOG_FILEPATH, encoding='utf-8')
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
    
    # Log initial message
    root_logger.info(
        f"Logging initialized at level {level.upper()}, "
        f"console={console}, file={file}, json={json_format}, "
        f"log_file={LOG_FILEPATH}"
    )
    
    return root_logger


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger with the specified name.
    
    Args:
        name: Logger name
    
    Returns:
        Logger instance
    """
    return logging.getLogger(name)


def log_environment(env_info: Dict[str, Any]) -> None:
    """
    Log environment information.
    
    Args:
        env_info: Environment information dictionary
    """
    logger = get_logger("setup.environment")
    
    # Log OS information
    os_info = env_info.get('os', {})
    logger.info(f"Operating System: {os_info.get('name')} {os_info.get('version')}")
    
    # Log Python information
    python_info = env_info.get('python', {})
    logger.info(f"Python: {python_info.get('version')} ({python_info.get('implementation')})")
    
    # Log virtual environment status
    if python_info.get('is_virtual_env', False):
        logger.info(f"Virtual Environment: {python_info.get('venv_path', 'Unknown')}")
    else:
        logger.info("Virtual Environment: None")
    
    # Log shell information
    shell_info = env_info.get('shell', {})
    logger.info(f"Shell: {shell_info.get('type')} {shell_info.get('version', '')}")
    
    # Log IDE information
    ide_info = env_info.get('ide', {})
    if ide_info.get('detected', False):
        logger.info(f"IDE: {ide_info.get('name')} {ide_info.get('version', '')}")
    else:
        logger.info("IDE: None detected")
    
    # Log important issues
    issues = env_info.get('issues', [])
    if issues:
        logger.warning(f"Detected {len(issues)} environment issues:")
        for issue in issues:
            logger.warning(f"  - {issue}")


def log_step_start(step_name: str, details: Optional[str] = None) -> None:
    """
    Log the start of a setup step.
    
    Args:
        step_name: Name of the step
        details: Optional details about the step
    """
    logger = get_logger("setup.steps")
    message = f"Starting step: {step_name}"
    if details:
        message += f" - {details}"
    logger.info(message)


def log_step_end(step_name: str, success: bool, message: Optional[str] = None, 
                 duration: Optional[float] = None) -> None:
    """
    Log the end of a setup step.
    
    Args:
        step_name: Name of the step
        success: Whether the step succeeded
        message: Optional message about the step result
        duration: Optional duration of the step in seconds
    """
    logger = get_logger("setup.steps")
    
    status = "succeeded" if success else "failed"
    log_message = f"Step {step_name} {status}"
    
    if duration is not None:
        log_message += f" in {duration:.2f}s"
    
    if message:
        log_message += f": {message}"
    
    if success:
        logger.info(log_message)
    else:
        logger.error(log_message)


def log_package_installation(package_name: str, success: bool, version: Optional[str] = None,
                            details: Optional[str] = None) -> None:
    """
    Log package installation information.
    
    Args:
        package_name: Name of the package
        success: Whether installation succeeded
        version: Optional installed version
        details: Optional details about the installation
    """
    logger = get_logger("setup.packages")
    
    if success:
        message = f"Package {package_name} installed successfully"
        if version:
            message += f" (version {version})"
        logger.info(message)
    else:
        message = f"Failed to install package {package_name}"
        if details:
            message += f": {details}"
        logger.error(message)


def log_exception(exception: Exception, context: Optional[str] = None) -> None:
    """
    Log an exception with context.
    
    Args:
        exception: The exception object
        context: Optional context information
    """
    logger = get_logger("setup.exceptions")
    
    if context:
        logger.exception(f"{context}: {str(exception)}")
    else:
        logger.exception(str(exception))


# Initialize module-level variables
current_log_path = LOG_FILEPATH

def initialize_logging(config: Optional[Dict[str, Any]] = None) -> logging.Logger:
    """
    Initialize the logging system with configuration.
    
    Args:
        config: Optional configuration dictionary
    
    Returns:
        Configured root logger
    """
    if config is None:
        config = {}
    
    # Extract logging configuration
    level = config.get("log_level", "info")
    console = config.get("log_console", True)
    file = config.get("log_file", True)
    json_format = config.get("log_json", False)
    
    # Extract context from config
    context = {
        "setup_id": config.get("setup_id", datetime.datetime.now().strftime("%Y%m%d_%H%M%S")),
        "project_root": str(config.get("project_root", "unknown")),
    }
    
    # Use a simplified console format
    console_format = "%(message)s"  # Just show the message for console output
    
    # Configure logging
    return configure_logging(level, console, file, json_format, context, console_format)