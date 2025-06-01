"""Custom exceptions for path handling operations.

This module defines the exception hierarchy used in path handling operations.
All exceptions inherit from the base PathHandlerError to allow for specific
error handling while maintaining a common catch-all base.

Note:
    All exceptions include detailed error messages and preserve the original
    exception context where applicable.
"""

from typing import Optional
from pathlib import Path


class PathHandlerError(Exception):
    """Base exception for all path handling errors.
    
    Attributes:
        message: The error message
        path: The path that caused the error
        original_error: The original exception if this wraps another error
    """
    
    def __init__(
        self,
        message: str,
        path: Optional[Path] = None,
        original_error: Optional[Exception] = None
    ) -> None:
        """Initialize the base path handler error.
        
        Args:
            message: Detailed error message
            path: Optional path that caused the error
            original_error: Optional original exception being wrapped
        """
        self.path = path
        self.original_error = original_error
        super().__init__(
            f"{message}"
            f"{f' Path: {path}' if path else ''}"
            f"{f' Original error: {str(original_error)}' if original_error else ''}"
        )


class InvalidPathError(PathHandlerError):
    """Raised when a path is invalid or malformed.
    
    This includes:
        - Invalid characters
        - Reserved names
        - Malformed paths
    """
    pass


class PathPermissionError(PathHandlerError):
    """Raised for permission-related path errors.
    
    This includes:
        - Insufficient read/write permissions
        - Locked files
        - Access denied scenarios
    """
    pass


class PathLengthError(PathHandlerError):
    """Raised when path length exceeds system limits.
    
    This includes:
        - Absolute path length limits
        - Relative path length limits
        - System-specific constraints
    """
    pass


class FileSystemError(PathHandlerError):
    """Raised for filesystem-specific errors.
    
    This includes:
        - Filesystem type constraints
        - Quota limits
        - System-specific limitations
    """
    pass


class PathNotFoundError(PathHandlerError):
    """Raised when a path does not exist.
    
    This includes:
        - Missing files
        - Missing directories
        - Invalid drive letters
    """
    pass


class PathExistsError(PathHandlerError):
    """Raised when a path already exists but shouldn't.
    
    This includes:
        - Existing files when creating new ones
        - Existing directories when exclusive creation is requested
    """
    pass


class PathTypeError(PathHandlerError):
    """Raised when path type is incorrect.
    
    This includes:
        - File when directory expected
        - Directory when file expected
        - Special file types (symlinks, etc.)
    """
    pass


class PathOperationError(PathHandlerError):
    """Raised when a path operation fails.
    
    This includes:
        - Copy operations
        - Move operations
        - Delete operations
        - Rename operations
    """
    pass