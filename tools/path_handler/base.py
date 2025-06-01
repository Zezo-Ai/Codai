"""Abstract base class for path handling operations.

This module defines the core interface for path handling operations through an
abstract base class. All concrete path handlers must implement these interfaces
to ensure consistent behavior across different platforms.

Note:
    All implementations must maintain the contract defined by these abstract methods
    and handle platform-specific details in their concrete implementations.
"""

import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import (
    Union, Optional, List, Dict, Any,
    Tuple, Protocol, runtime_checkable
)

from .constants import (
    WINDOWS_PATH_LIMIT,
    MAX_FILE_SIZE,
    REQUIRED_PERMISSIONS
)
from .exceptions import (
    PathHandlerError,
    InvalidPathError,
    PathPermissionError,
    PathLengthError
)


@runtime_checkable
class PathLike(Protocol):
    """Protocol for objects that can be converted to paths."""
    
    def __fspath__(self) -> Union[str, bytes]: ...


class BasePathHandler(ABC):
    """Abstract base class defining the interface for path handling operations.
    
    This class provides the contract that all path handlers must fulfill,
    ensuring consistent behavior across different platforms and filesystems.
    
    Attributes:
        platform: The current platform identifier
        supported_schemes: List of supported URL schemes
    """
    
    def __init__(self) -> None:
        """Initialize the base path handler."""
        self.platform: str = os.name
        self.supported_schemes: List[str] = ['file']
    
    @abstractmethod
    def validate(
        self,
        path: Union[str, Path, PathLike],
        *,
        must_exist: bool = True,
        check_permissions: bool = True,
        required_permission: str = 'r'
    ) -> Path:
        """Validate a path for correctness and accessibility.
        
        Args:
            path: The path to validate
            must_exist: Whether the path must exist
            check_permissions: Whether to check permissions
            required_permission: Required permission mode ('r', 'w', 'a')
            
        Returns:
            Path: Validated and normalized path object
            
        Raises:
            InvalidPathError: If path is invalid
            PathPermissionError: If permission requirements not met
            PathNotFoundError: If path doesn't exist and must_exist is True
        """
        pass
    
    @abstractmethod
    def normalize(
        self,
        path: Union[str, Path, PathLike],
        *,
        make_absolute: bool = True,
        resolve_symlinks: bool = True
    ) -> Path:
        """Normalize a path to a standard format.
        
        Args:
            path: The path to normalize
            make_absolute: Whether to convert to absolute path
            resolve_symlinks: Whether to resolve symbolic links
            
        Returns:
            Path: Normalized path object
            
        Raises:
            InvalidPathError: If path cannot be normalized
        """
        pass
    
    @abstractmethod
    def check_access(
        self,
        path: Path,
        required_permissions: str,
        *,
        follow_symlinks: bool = True
    ) -> bool:
        """Check if path is accessible with required permissions.
        
        Args:
            path: The path to check
            required_permissions: Required permission mode ('r', 'w', 'a')
            follow_symlinks: Whether to follow symbolic links
            
        Returns:
            bool: True if path is accessible with required permissions
            
        Raises:
            PathPermissionError: If permission check fails
        """
        pass
    
    @abstractmethod
    def get_path_info(self, path: Path) -> Dict[str, Any]:
        """Get detailed information about a path.
        
        Args:
            path: The path to analyze
            
        Returns:
            Dict containing:
                type: File type (file, dir, symlink, etc.)
                size: Size in bytes
                permissions: Current permissions
                timestamps: Creation, modification times
                filesystem: Filesystem information
                
        Raises:
            PathNotFoundError: If path doesn't exist
        """
        pass
    
    def _validate_length(self, path: Path) -> None:
        """Validate path length against system limits.
        
        Args:
            path: The path to validate
            
        Raises:
            PathLengthError: If path exceeds length limits
        """
        path_str = str(path.absolute())
        if len(path_str) > WINDOWS_PATH_LIMIT:
            raise PathLengthError(
                f"Path length ({len(path_str)}) exceeds system limit "
                f"({WINDOWS_PATH_LIMIT})",
                path=path
            )
    
    def _validate_permissions(
        self,
        path: Path,
        required_permission: str
    ) -> None:
        """Validate path permissions.
        
        Args:
            path: The path to validate
            required_permission: Required permission mode
            
        Raises:
            PathPermissionError: If permission requirements not met
        """
        if required_permission not in REQUIRED_PERMISSIONS:
            raise ValueError(f"Invalid permission mode: {required_permission}")
            
        if not self.check_access(path, required_permission):
            raise PathPermissionError(
                f"Insufficient permissions for {required_permission} access",
                path=path
            )
    
    def __repr__(self) -> str:
        """Return string representation of the path handler."""
        return f"{self.__class__.__name__}(platform={self.platform})"