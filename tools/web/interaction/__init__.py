"""Web interaction tool package for browser automation.

This package provides modular components for programmatic interaction with web pages, including:
- Form filling and submission
- Button clicking and navigation
- Login workflows
- Element interaction and extraction
- Screenshot capture

Built on Selenium for modern, reliable browser automation.

New in this version:
- Comprehensive diagnostic and event logging system
- Performance metrics for all operations
- Detailed error tracking and reporting
- State transition monitoring
- Execution time measurements
"""

from .tool import WebInteractionTool
from .logger import EventLogger, configure_logger, web_logger

__all__ = ["WebInteractionTool", "EventLogger", "configure_logger", "web_logger"]