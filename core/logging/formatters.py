"""Custom log formatters."""

import logging
import json
from datetime import datetime
from typing import Any, Dict

class JsonFormatter(logging.Formatter):
    """JSON formatter for structured logging."""
    
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

class ColoredFormatter(logging.Formatter):
    """Formatter with colored output for console."""
    
    COLORS = {
        'DEBUG': '\033[37m',     # White
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'
    
    def format(self, record: logging.LogRecord) -> str:
        """Format the record with colors."""
        color = self.COLORS.get(record.levelname, self.RESET)
        record.color_message = f"{color}{record.getMessage()}{self.RESET}"
        
        return super().format(record)