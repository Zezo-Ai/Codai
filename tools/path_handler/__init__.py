"""Path handling module for cross-platform path operations.

This module provides a comprehensive interface for handling file system paths
across different platforms, with specific focus on Windows and Unix path handling
and proper path validation.

Example:
    >>> from tools.path_handler import get_path_handler
    >>> handler = get_path_handler()
    >>> path = handler.normalize("/home/user/test")
    >>> print(path)
    /home/user/test

Note:
    All path operations are performed with proper validation and
    platform-specific considerations.
"""

import platform
from typing import Union, Optional, Type

from .base import BasePathHandler, PathLike
from .windows import WindowsPathHandler

# Import UnixPathHandler conditionally
try:
    from .unix import UnixPathHandler, UNIX_SUPPORTED
except ImportError:
    UNIX_SUPPORTED = False

from .constants import (
    WINDOWS_PATH_LIMIT,
    EXTENDED_PATH_PREFIX,
    INVALID_CHARS,
    RESERVED_NAMES
)
from .exceptions import (
    PathHandlerError,
    InvalidPathError,
    PathPermissionError,
    PathLengthError,
    FileSystemError,
    PathNotFoundError,
    PathExistsError,
    PathTypeError,
    PathOperationError
)
from .utils import (
    is_windows,
    normalize_separators,
    get_path_components,
    join_path_components,
    is_valid_filename,
    get_relative_path,
    expand_path,
    clean_path,
    parse_path_url,
    check_path_access,
    get_common_prefix
)

__version__ = "1.0.0"
__author__ = "CODAI"
__all__ = [
    # Main interface
    "get_path_handler",
    "PathHandler",
    
    # Base classes
    "BasePathHandler",
    "PathLike",
    
    # Platform-specific handlers
    "WindowsPathHandler",
    
    # Constants
    "WINDOWS_PATH_LIMIT",
    "EXTENDED_PATH_PREFIX",
    "INVALID_CHARS",
    "RESERVED_NAMES",
    
    # Exceptions
    "PathHandlerError",
    "InvalidPathError",
    "PathPermissionError",
    "PathLengthError",
    "FileSystemError",
    "PathNotFoundError",
    "PathExistsError",
    "PathTypeError",
    "PathOperationError",
    
    # Utility functions
    "is_windows",
    "normalize_separators",
    "get_path_components",
    "join_path_components",
    "is_valid_filename",
    "get_relative_path",
    "expand_path",
    "clean_path",
    "parse_path_url",
    "check_path_access",
    "get_common_prefix"
]

# Add UnixPathHandler to __all__ if available
if UNIX_SUPPORTED:
    __all__.append("UnixPathHandler")

# Type alias for path handler types
if UNIX_SUPPORTED:
    PathHandler = Union[WindowsPathHandler, UnixPathHandler]
else:
    PathHandler = Union[WindowsPathHandler]


def get_path_handler(
    handler_type: Optional[Type[BasePathHandler]] = None
) -> PathHandler:
    """Get appropriate path handler for current platform.
    
    Args:
        handler_type: Optional specific handler type to use
        
    Returns:
        PathHandler: Appropriate path handler instance
        
    Raises:
        ValueError: If specified handler type is not supported
    """
    if handler_type is not None:
        if not issubclass(handler_type, BasePathHandler):
            raise ValueError(f"Invalid handler type: {handler_type}")
        return handler_type()
        
    if platform.system().lower() == 'windows':
        return WindowsPathHandler()
    elif UNIX_SUPPORTED:
        return UnixPathHandler()
    else:
        # Fallback to Windows handler if Unix not supported
        return WindowsPathHandler()