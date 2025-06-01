"""Server logging utilities with focused, clean logging."""

import os
import sys
import logging
from pathlib import Path
from datetime import datetime

# Base logs directory
LOGS_DIR = Path("logs")

# Log file paths
LOG_FILES = {
    'debug': LOGS_DIR / 'debug.log',
    'error': LOGS_DIR / 'error.log',
    'chat': LOGS_DIR / 'chat.log',
    'server': LOGS_DIR / 'server.log'
}

# Log formats
FORMATS = {
    'debug': '[%(asctime)s] %(levelname)s [%(name)s] %(message)s',
    'error': '[%(asctime)s] ERROR [%(name)s] %(message)s\nDetails: %(details)s\n',
    'chat': '[%(asctime)s] %(levelname)s [%(session_id)s] %(message)s'
}

def clean_old_logs():
    """Clear content of existing log files."""
    try:
        # First shutdown all logging to release file handles
        shutdown_logging()
        
        # Now try to clear (not delete) log files
        if LOGS_DIR.exists():
            for file in LOGS_DIR.glob('*.log*'):
                try:
                    if file.exists():
                        # Open in write mode to truncate content
                        with open(file, 'w') as f:
                            pass  # Just truncate, don't delete
                except Exception as e:
                    print(f"Failed to clear {file}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"Error clearing logs: {e}", file=sys.stderr)

class ChatFormatter(logging.Formatter):
    """Custom formatter for chat logs."""
    
    def format(self, record):
        # Extract relevant info for chat logs
        if not hasattr(record, 'session_id'):
            record.session_id = 'NO_SESSION'
            
        # Clean up extra data for relevant information only
        if hasattr(record, 'extra_data'):
            clean_data = {
                k: v for k, v in record.extra_data.items()
                if k in ['session_id', 'action', 'error', 'status']
            }
            record.extra_data = clean_data
            
        return super().format(record)

def setup_logger(name: str, log_file: Path, level: int, format_str: str) -> logging.Logger:
    """Setup a logger with file handler."""
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Create handler
    handler = logging.FileHandler(log_file, mode='w')  # 'w' mode to overwrite
    handler.setLevel(level)
    
    # Set formatter based on log type
    if 'chat' in name:
        formatter = ChatFormatter(format_str)
    else:
        formatter = logging.Formatter(format_str)
    handler.setFormatter(formatter)
    
    # Add handler
    logger.addHandler(handler)
    
    return logger

def setup_logging():
    """Initialize the logging system."""
    # Create logs directory
    LOGS_DIR.mkdir(exist_ok=True)
    
    # Ensure log files exist but are empty
    for log_file in LOG_FILES.values():
        if not log_file.parent.exists():
            log_file.parent.mkdir(parents=True, exist_ok=True)
        if not log_file.exists():
            log_file.touch()
    
    # Close and remove any existing handlers
    for name in ['server.debug', 'server.error', 'server.chat']:
        logger = logging.getLogger(name)
        for handler in logger.handlers[:]:
            handler.close()
            logger.removeHandler(handler)
    
    # Setup individual loggers
    loggers = {
        'debug': setup_logger('server.debug', LOG_FILES['debug'], logging.DEBUG, FORMATS['debug']),
        'error': setup_logger('server.error', LOG_FILES['error'], logging.ERROR, FORMATS['error']),
        'chat': setup_logger('server.chat', LOG_FILES['chat'], logging.DEBUG, FORMATS['chat'])
    }
    
    # Add console handler for errors
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter(FORMATS['debug']))
    loggers['error'].addHandler(console)
    
    # Log startup
    startup_msg = f"\n{'='*50}\nServer started at {datetime.now()}\n{'='*50}\n"
    for logger in loggers.values():
        logger.info(startup_msg)
    
    return loggers

def get_logger(name: str) -> logging.Logger:
    """Get a logger by name."""
    if name.startswith('chat'):
        return logging.getLogger('server.chat')
    elif name.startswith('error'):
        return logging.getLogger('server.error')
    else:
        return logging.getLogger('server.debug')

# Global logger storage
LOGGERS = None

def init_logging():
    """Initialize logging if not already initialized."""
    global LOGGERS
    if LOGGERS is None:
        LOGGERS = setup_logging()
    return LOGGERS

def shutdown_logging():
    """Properly shutdown all loggers and handlers."""
    global LOGGERS
    if LOGGERS:
        # First close all handlers to release file handles
        for logger in LOGGERS.values():
            handlers = logger.handlers[:]
            for handler in handlers:
                handler.flush()
                handler.close()
                logger.removeHandler(handler)
            logger.handlers = []
        
        # Now truncate all log files
        for log_file in LOG_FILES.values():
            try:
                # Open in write mode to truncate
                with open(log_file, 'w') as f:
                    pass
            except Exception as e:
                print(f"Error clearing log file {log_file}: {e}", file=sys.stderr)
        
        LOGGERS = None

# Initialize logging on first get_logger call
def get_logger(name: str) -> logging.Logger:
    """Get a logger by name."""
    global LOGGERS
    if LOGGERS is None:
        LOGGERS = setup_logging()
        
    if name.startswith('chat'):
        return logging.getLogger('server.chat')
    elif name.startswith('error'):
        return logging.getLogger('server.error')
    else:
        return logging.getLogger('server.debug')


def setup_server_logging(log_level=None, log_file=None):
    """
    Set up server logging configuration.

    Args:
        log_level: Optional log level (string or int)
        log_file: Optional log file path

    Returns:
        Configured logger
    """
    global LOGGERS
    
    # Initialize if not already done
    if LOGGERS is None:
        LOGGERS = setup_logging()
    
    # Get the main server logger
    logger = logging.getLogger('server.debug')
    
    # Set log level if specified
    if log_level is not None:
        if isinstance(log_level, str):
            level_map = {
                'debug': logging.DEBUG,
                'info': logging.INFO,
                'warning': logging.WARNING,
                'error': logging.ERROR,
                'critical': logging.CRITICAL
            }
            log_level = level_map.get(log_level.lower(), logging.INFO)
        logger.setLevel(log_level)
    
    # Configure custom log file if specified
    if log_file is not None:
        log_file_path = Path(log_file)
        
        # Create directory if needed
        if not log_file_path.parent.exists():
            log_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Create file handler
        file_handler = logging.FileHandler(log_file_path)
        file_handler.setFormatter(logging.Formatter(FORMATS['debug']))
        
        # Add to logger
        logger.addHandler(file_handler)
    
    return logger


def get_server_logger(name="server"):
    """
    Get a server logger by name.
    
    Args:
        name: Logger name/category
        
    Returns:
        Logger instance
    """
    # Initialize logging if needed
    global LOGGERS
    if LOGGERS is None:
        LOGGERS = setup_logging()
    
    # Get appropriate logger
    if name == "server":
        logger = logging.getLogger('server.debug')
    elif name.startswith('chat'):
        logger = logging.getLogger('server.chat')
    elif name.startswith('error'):
        logger = logging.getLogger('server.error')
    else:
        logger = logging.getLogger(f'server.{name}')
    
    return logger