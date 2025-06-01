"""Diagnostic and event logging system for web interaction tool.

This module provides a comprehensive logging system that tracks:
- Events and actions
- Timing information
- Success/failure results
- Error details and context
- Performance metrics
- State transitions
"""

import logging
import time
import json
import os
import sys
import traceback
from datetime import datetime
from typing import Dict, Any, Optional, List, Union, Tuple

# Create a dedicated logger for web interaction diagnostics
web_logger = logging.getLogger("web_interaction")

# Configure default logging level
web_logger.setLevel(logging.INFO)

# Log format with timestamp, level, and message
log_format = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')

# Add console handler by default with Unicode encoding support
# On Windows, we need to handle Unicode explicitly due to console limitations
if sys.platform == 'win32':
    # Use UTF-8 encoding for console output on Windows
    import codecs
    # Get a UTF-8 stream writer for stdout
    utf8_writer = codecs.getwriter('utf-8')(sys.stdout.buffer)
    console_handler = logging.StreamHandler(utf8_writer)
else:
    # On other platforms, use standard output
    console_handler = logging.StreamHandler()

console_handler.setFormatter(log_format)
web_logger.addHandler(console_handler)

# Create a file handler for persistent logs
try:
    log_directory = os.path.join(os.path.expanduser("~"), ".codaiapp", "logs", "web_interaction")
    os.makedirs(log_directory, exist_ok=True)
    
    # Current date for log file naming
    current_date = datetime.now().strftime("%Y-%m-%d")
    log_file = os.path.join(log_directory, f"web_interaction_{current_date}.log")
    
    # Add file handler with UTF-8 encoding explicitly specified
    if sys.platform == 'win32':
        file_handler = logging.FileHandler(log_file, 'w', encoding='utf-8')
    else:
        file_handler = logging.FileHandler(log_file)
        
    file_handler.setFormatter(log_format)
    web_logger.addHandler(file_handler)
except Exception as e:
    web_logger.warning(f"Could not set up log file: {str(e)}")

# Track event timings for performance monitoring
_event_timers = {}

class EventLogger:
    """Tracks events, timings, and results for web interaction operations."""
    
    @staticmethod
    def event_start(event_type: str, action: str, details: Optional[Dict[str, Any]] = None) -> str:
        """Start tracking an event with timing.
        
        Args:
            event_type: Type of event (action, navigation, waiting, etc.)
            action: Specific action being performed
            details: Additional context about the event
            
        Returns:
            Event ID for later reference
        """
        event_id = f"{event_type}_{action}_{time.time()}"
        _event_timers[event_id] = {"start": time.time(), "type": event_type, "action": action}
        
        log_message = f"EVENT START: {event_type} | {action}"
        if details:
            _event_timers[event_id]["details"] = details
            # Format details for log without overwhelming it
            brief_details = {k: v for k, v in details.items() 
                            if k in ['url', 'selector', 'wait_strategy'] or k.endswith('_id')}
            log_message += f" | {json.dumps(brief_details)}"
        
        web_logger.info(log_message)
        return event_id
    
    @staticmethod
    def event_end(event_id: str, status: str = "success", result: Optional[Dict[str, Any]] = None, 
                 error: Optional[Exception] = None) -> Dict[str, Any]:
        """End tracking an event and record timing and results.
        
        Args:
            event_id: Event ID from event_start
            status: Outcome status (success, error, warning)
            result: Result data from the operation
            error: Exception if an error occurred
            
        Returns:
            Complete event data including timing
        """
        if event_id not in _event_timers:
            web_logger.warning(f"Unknown event ID: {event_id}")
            return {}
        
        # Calculate timing
        end_time = time.time()
        start_time = _event_timers[event_id]["start"]
        duration = end_time - start_time
        
        # Add result data
        event_data = _event_timers[event_id]
        event_data["end"] = end_time
        event_data["duration"] = duration
        event_data["status"] = status
        
        if result:
            event_data["result"] = result
        
        # Build log message
        log_message = f"EVENT END: {event_data['type']} | {event_data['action']} | {status} | {duration:.3f}s"
        
        # Handle errors
        if error:
            event_data["error"] = {
                "type": type(error).__name__,
                "message": str(error)
            }
            
            # Include stack trace for debugging
            if isinstance(error, Exception):
                event_data["error"]["traceback"] = traceback.format_exc()
            
            # Log error details
            log_message += f" | ERROR: {type(error).__name__}: {str(error)}"
            web_logger.error(log_message)
        else:
            # Log according to status
            if status == "success":
                web_logger.info(log_message)
            elif status == "warning":
                web_logger.warning(log_message)
            else:
                web_logger.error(log_message)
        
        # Clean up timer
        del _event_timers[event_id]
        
        return event_data
    
    @staticmethod
    def action_log(action: str, details: Optional[Dict[str, Any]] = None, 
                  level: str = "info") -> None:
        """Log a single action without explicit timing.
        
        Args:
            action: Description of the action
            details: Additional context about the action
            level: Log level (debug, info, warning, error)
        """
        log_message = f"ACTION: {action}"
        if details:
            # Format brief details for log
            simple_details = str({k: v for k, v in details.items() 
                                if not isinstance(v, (dict, list, set))})
            log_message += f" | {simple_details}"
        
        if level == "debug":
            web_logger.debug(log_message)
        elif level == "warning":
            web_logger.warning(log_message)
        elif level == "error":
            web_logger.error(log_message)
        else:  # default to info
            web_logger.info(log_message)
    
    @staticmethod
    def state_transition(from_state: str, to_state: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Log a state transition in the workflow.
        
        Args:
            from_state: Starting state
            to_state: Ending state
            context: Additional context about the transition
        """
        # Using standard ASCII arrow '->' for maximum compatibility
        # while retaining the semantic meaning
        log_message = f"STATE: {from_state} -> {to_state}"
        if context:
            # Simplify context for log
            brief_context = {k: str(v)[:30] for k, v in context.items() 
                            if k in ['url', 'selector', 'action', 'element_id']}
            log_message += f" | {json.dumps(brief_context)}"
        
        web_logger.info(log_message)
    
    @staticmethod
    def performance_metric(metric_name: str, value: Union[float, int], 
                          context: Optional[Dict[str, Any]] = None) -> None:
        """Log a performance metric.
        
        Args:
            metric_name: Name of the metric being recorded
            value: Metric value (usually time in seconds)
            context: Additional context about the metric
        """
        log_message = f"METRIC: {metric_name} | {value}"
        if context:
            # Simplify context for log
            brief_context = {k: v for k, v in context.items() 
                            if k in ['url', 'selector', 'action', 'wait_strategy']}
            log_message += f" | {json.dumps(brief_context)}"
        
        web_logger.info(log_message)
    
    @staticmethod
    def diagnostic(message: str, data: Optional[Dict[str, Any]] = None, 
                 level: str = "debug") -> None:
        """Log detailed diagnostic information.
        
        Args:
            message: Diagnostic message
            data: Additional diagnostic data
            level: Log level (debug, info, warning, error)
        """
        log_message = f"DIAG: {message}"
        if data:
            # Very brief data for log
            brief_data = str(data)[:100] + "..." if len(str(data)) > 100 else str(data)
            log_message += f" | {brief_data}"
        
        if level == "info":
            web_logger.info(log_message)
        elif level == "warning":
            web_logger.warning(log_message)
        elif level == "error":
            web_logger.error(log_message)
        else:  # default to debug
            web_logger.debug(log_message)
    
    @staticmethod
    def error_details(error: Exception, context: Optional[Dict[str, Any]] = None) -> None:
        """Log detailed error information.
        
        Args:
            error: The exception that occurred
            context: Additional context about the error
        """
        error_type = type(error).__name__
        error_message = str(error)
        
        log_message = f"ERROR: {error_type}: {error_message}"
        
        if context:
            brief_context = {k: v for k, v in context.items() 
                            if k in ['url', 'selector', 'action', 'element_id']}
            log_message += f" | Context: {json.dumps(brief_context)}"
        
        # Get the traceback for detailed debugging
        tb = traceback.format_exc()
        log_message += f"\n{tb}"
        
        web_logger.error(log_message)

# Configure logger based on environment
def configure_logger(log_level: str = None, enable_file_logging: bool = True, 
                    log_directory: str = None) -> None:
    """Configure the web interaction logger.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
        enable_file_logging: Whether to log to files
        log_directory: Custom directory for log files
    """
    # Set log level if provided
    if log_level:
        level = getattr(logging, log_level.upper(), logging.INFO)
        web_logger.setLevel(level)
    
    # Remove existing handlers
    for handler in web_logger.handlers[:]:
        web_logger.removeHandler(handler)
    
    # Always add console handler with proper Unicode support
    if sys.platform == 'win32':
        # Use UTF-8 encoding for console output on Windows
        import codecs
        # Get a UTF-8 stream writer for stdout
        utf8_writer = codecs.getwriter('utf-8')(sys.stdout.buffer)
        console_handler = logging.StreamHandler(utf8_writer)
    else:
        # On other platforms, use standard output
        console_handler = logging.StreamHandler()
        
    console_handler.setFormatter(log_format)
    web_logger.addHandler(console_handler)
    
    # Add file handler if enabled
    if enable_file_logging:
        try:
            # Use provided directory or default
            log_dir = log_directory or os.path.join(os.path.expanduser("~"), ".codaiapp", "logs", "web_interaction")
            os.makedirs(log_dir, exist_ok=True)
            
            # Current date for log file naming
            current_date = datetime.now().strftime("%Y-%m-%d")
            log_file = os.path.join(log_dir, f"web_interaction_{current_date}.log")
            
            # Add file handler with UTF-8 encoding
            if sys.platform == 'win32':
                file_handler = logging.FileHandler(log_file, 'w', encoding='utf-8')
            else:
                file_handler = logging.FileHandler(log_file)
                
            file_handler.setFormatter(log_format)
            web_logger.addHandler(file_handler)
            
            web_logger.info(f"Logging to file: {log_file}")
        except Exception as e:
            web_logger.warning(f"Could not set up log file: {str(e)}")