"""Unified logging configuration manager for the entire application."""

import logging
import logging.handlers
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, List, Any, Union
import json
import os
import shutil
import threading
import yaml

class JsonFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging."""
    
    def format(self, record: logging.LogRecord) -> str:
        """Format the record as JSON."""
        log_data = self._get_base_fields(record)
        self._add_extra_fields(record, log_data)
        self._add_exception_info(record, log_data)
        self._add_context(record, log_data)
        
        return json.dumps(log_data)
    
    def _get_base_fields(self, record: logging.LogRecord) -> Dict[str, Any]:
        """Get base log record fields."""
        return {
            'timestamp': self.formatTime(record),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
            'thread': record.thread,
            'thread_name': record.threadName
        }
    
    def _add_extra_fields(self, record: logging.LogRecord, log_data: Dict[str, Any]) -> None:
        """Add extra fields from the record."""
        if hasattr(record, 'extra_data'):
            log_data.update(record.extra_data)
    
    def _add_exception_info(self, record: logging.LogRecord, log_data: Dict[str, Any]) -> None:
        """Add exception information if present."""
        if record.exc_info:
            log_data['exception'] = {
                'type': record.exc_info[0].__name__,
                'message': str(record.exc_info[1]),
                'traceback': self.formatException(record.exc_info)
            }
    
    def _add_context(self, record: logging.LogRecord, log_data: Dict[str, Any]) -> None:
        """Add context information if present."""
        if hasattr(record, 'context'):
            log_data['context'] = record.context

# Expose these for backwards compatibility
def get_logger(name: str, category: str = 'server', subcategory: str = '_base') -> logging.Logger:
    """Get a logger (compatibility function).
    
    This function exists for backwards compatibility.
    New code should import get_logger from core.logging directly.
    """
    from . import get_logger as core_get_logger
    return core_get_logger(name, category, subcategory)

class LogManager:
    """Centralized logging manager for the application."""
    
    # Log directory structure
    LOG_STRUCTURE = {
        'ai': {
            '_base': ['main.log', 'errors.log'],  # Base logs go in root ai/
            'chat': ['chat.log', 'responses.log', 'errors.log'],
            'inference': ['inference.log', 'errors.log'],
            'prompts': ['prompts.log', 'errors.log'],
            'tokens': ['usage.log', 'errors.log']
        },
        'server': {
            '_base': ['main.log', 'errors.log'],  # Base logs go in root server/
            'access': ['access.log', 'errors.log'],
            'metrics': ['metrics.log', 'performance.log', 'errors.log']
        },
        'tools': {
            '_base': ['main.log', 'errors.log'],  # Base logs go in root tools/
            'file_edit': ['operations.log', 'changes.log', 'errors.log'],
            'computer': ['commands.log', 'results.log', 'errors.log'],
            'browser': ['navigation.log', 'errors.log'],
            'system': ['operations.log', 'errors.log'],
            'packages': ['operations.log', 'errors.log']
        },
        'security': {
            '_base': ['main.log', 'errors.log', 'audit.log']  # Base logs go in root security/
        }
    }
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize the logging manager.
        
        Args:
            config_path: Path to logging configuration file
            
        Note:
            This only initializes the manager object without any file operations.
            Call setup() explicitly to create directories and initialize logging.
        """
        self.config_path = config_path
        self.handlers: Dict[str, logging.Handler] = {}
        self.loggers: Dict[str, logging.Logger] = {}
        self.context = threading.local()
        
        # Defer actual initialization until setup() is called
        self.project_root = None
        self.config = None
        self.log_dir = None
        self._initialized = False
    
    def _load_config(self) -> dict:
        """Load logging configuration from file."""
        if not self.config_path:
            return self._get_default_config()
            
        try:
            with open(self.config_path) as f:
                config = yaml.safe_load(f)
                # Extract just the logging configuration settings we need
                return {
                    'log_dir': config['logging']['log_dir'],
                    'default_level': config['logging']['default_level'],
                    'max_bytes': config['logging']['max_bytes'],
                    'backup_count': config['logging']['backup_count']
                }
        except Exception as e:
            print(f"Error loading logging config: {e}")
            return self._get_default_config()
    
    def _get_default_config(self) -> dict:
        """Get default logging configuration."""
        return {
            'default_level': 'INFO',
            'log_dir': 'logs',
            'max_bytes': 10485760,  # 10MB
            'backup_count': 5
        }
        
    def setup(self) -> None:
        """Set up the logging manager.
        
        This method should be called explicitly after initialization
        to set up the logging infrastructure.
        """
        if self._initialized:
            return
            
        # Initialize paths and config
        self.project_root = Path(__file__).parent.parent.parent
        self.config = self._load_config()
        self.log_dir = self.project_root / self.config['log_dir']
        
        # Create directories
        self.ensure_log_directories()
        
        # Set up logging handlers
        self._setup_logging()
        
        self._initialized = True
    
    def ensure_log_directories(self) -> None:
        """Create log directory structure and initialize log files."""
        try:
            # Create main log directory
            self.log_dir.mkdir(exist_ok=True)
            
            # Create category directories and initialize files
            for category, structure in self.LOG_STRUCTURE.items():
                category_dir = self.log_dir / category
                category_dir.mkdir(exist_ok=True)
                
                if isinstance(structure, dict):
                    # First handle base logs - they go directly in category root
                    if '_base' in structure:
                        for file_name in structure['_base']:
                            log_file = category_dir / file_name
                            log_file.touch(exist_ok=True)
                    
                    # Then handle specialized logs - they go in subfolders
                    for subcategory, files in structure.items():
                        if subcategory != '_base':
                            subcategory_dir = category_dir / subcategory
                            subcategory_dir.mkdir(exist_ok=True)
                            for file_name in files:
                                log_file = subcategory_dir / file_name
                                log_file.touch(exist_ok=True)
                else:
                    # Handle flat structure (though we don't use this anymore)
                    for file_name in structure:
                        log_file = category_dir / file_name
                        log_file.touch(exist_ok=True)
                
        except Exception as e:
            print(f"Error creating log directories: {e}")
            raise
    
    def _setup_logging(self) -> None:
        """Set up all logging handlers and formatters."""
        try:
            for category, structure in self.LOG_STRUCTURE.items():
                if isinstance(structure, dict):
                    # Handle subcategories
                    for subcategory, files in structure.items():
                        handlers = self._setup_handlers(category, subcategory, files)
                        self.handlers.update(handlers)
                else:
                    # Handle flat structure
                    handlers = self._setup_handlers(category, 'main', structure)
                    self.handlers.update(handlers)
        except Exception as e:
            print(f"Error setting up logging: {e}")
            raise

    def _setup_handlers(self, category: str, subcategory: str, files: List[str]) -> Dict[str, logging.Handler]:
        """Set up handlers for a specific category and subcategory."""
        handlers = {}
        
        # Determine the correct directory path
        if subcategory == '_base':
            # Base logs go directly in category root
            log_dir = self.log_dir / category
            log_dir.mkdir(parents=True, exist_ok=True)
        else:
            # Specialized logs go in their respective subfolders
            log_dir = self.log_dir / category / subcategory
            log_dir.mkdir(parents=True, exist_ok=True)
            
        for file in files:
            handler_key = f"{category}.{subcategory}.{file}"
            if handler_key not in self.handlers:
                # Create the log file
                log_file = log_dir / file
                log_file.touch(exist_ok=True)
                
                handler = logging.handlers.RotatingFileHandler(
                    filename=str(log_file),
                    maxBytes=self.config['max_bytes'],
                    backupCount=self.config['backup_count'],
                    encoding='utf-8'
                )
                
                # Configure formatter
                if file in ['access.log', 'performance.log']:
                    handler.setFormatter(self._get_detailed_formatter())
                else:
                    handler.setFormatter(self._get_json_formatter())
                
                # Set level for error logs
                if 'errors' in file:
                    handler.setLevel(logging.ERROR)
                
                handlers[handler_key] = handler
                
        return handlers

    def _get_json_formatter(self) -> logging.Formatter:
        """Get JSON formatter instance."""
        return JsonFormatter()

    def _get_detailed_formatter(self) -> logging.Formatter:
        """Get detailed formatter instance."""
        return logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
    
    def get_logger(self, name: str, category: str = 'server', subcategory: str = 'main') -> logging.Logger:
        """Get a configured logger instance.
        
        Args:
            name: Logger name (will be prefixed with category)
            category: Main category (ai, server, tools, security)
            subcategory: Subcategory within the main category
            
        Returns:
            Logger instance configured for use
        """
        if not self._initialized:
            self.setup()
            
        logger_key = f"{category}.{subcategory}.{name}"
        
        if logger_key not in self.loggers:
            logger = logging.getLogger(logger_key)
            logger.setLevel(self.config['default_level'])
            logger.propagate = False
            
            # Clear existing handlers
            logger.handlers = []
            
            # Get the appropriate log files
            structure = self.LOG_STRUCTURE[category]
            if isinstance(structure, dict):
                files = structure.get(subcategory, structure['_base'])
            else:
                files = structure
            
            # Add appropriate handlers
            for file in files:
                handler_key = f"{category}.{subcategory}.{file}"
                if handler_key in self.handlers:
                    logger.addHandler(self.handlers[handler_key])
            
            self.loggers[logger_key] = logger
        
        return self.loggers[logger_key]
    
    def cleanup_logs(self) -> None:
        """Clean up existing log files and handlers."""
        try:
            # Close all handlers and remove from loggers
            for logger in self.loggers.values():
                for handler in logger.handlers[:]:
                    logger.removeHandler(handler)
                    handler.close()
            
            self.handlers.clear()
            self.loggers.clear()
            
            # Reset initialization state
            self._initialized = False
            
        except Exception as e:
            print(f"Error during log cleanup: {e}")
            raise