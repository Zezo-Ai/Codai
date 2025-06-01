"""Unix-specific path handling implementation.

This module provides Unix/Linux-specific path handling functionality, implementing
the abstract base class for path operations. It handles Unix path formats,
permissions, and filesystem operations.

Note:
    This implementation handles Unix path specifics including:
    - Root-based absolute paths
    - Symbolic links
    - Unix permissions
    - File system attributes
"""

import os
import stat
from datetime import datetime
from pathlib import Path, PureWindowsPath, PurePosixPath
from typing import Union, Dict, Any, Optional, Set, List

# Platform-specific imports
try:
    import pwd
    import grp
    UNIX_SUPPORTED = True
except ImportError:
    UNIX_SUPPORTED = False

from .base import BasePathHandler, PathLike
from .constants import MAX_FILE_SIZE
from .exceptions import (
    PathHandlerError,
    InvalidPathError,
    PathPermissionError,
    PathNotFoundError,
    PathTypeError,
    FileSystemError
)


class UnixPathHandler(BasePathHandler):
    """Unix-specific path handler implementation.
    
    This class handles Unix path operations with proper support for:
    - Absolute and relative paths
    - Symbolic links
    - Unix permissions and ownership
    - Unix filesystem features
    
    Note:
        When running on Windows, some Unix-specific features will be simulated
        or limited in functionality.
    
    Attributes:
        _root_path: Root directory path
        _is_unix: Whether running on Unix-like system
    """
    
    def __init__(self) -> None:
        """Initialize the Unix path handler."""
        super().__init__()
        self._root_path = PurePosixPath('/')
        self._is_unix = UNIX_SUPPORTED
    
    def validate(
        self,
        path: Union[str, Path, PathLike],
        *,
        must_exist: bool = True,
        check_permissions: bool = True,
        required_permission: str = 'r'
    ) -> Path:
        """Validate a Unix path for correctness and accessibility.
        
        Args:
            path: The path to validate
            must_exist: Whether the path must exist
            check_permissions: Whether to check permissions
            required_permission: Required permission mode
            
        Returns:
            Path: Validated path object
            
        Raises:
            InvalidPathError: If path format is invalid
            PathNotFoundError: If path doesn't exist and must_exist is True
            PathPermissionError: If permission requirements not met
        """
        try:
            # Convert and normalize path
            unix_path = self.normalize(path)
            
            # Check existence if required
            if must_exist and not unix_path.exists():
                raise PathNotFoundError(
                    "Path does not exist",
                    path=unix_path
                )
            
            # Validate length
            self._validate_length(unix_path)
            
            # Check permissions if required
            if check_permissions:
                self._validate_permissions(unix_path, required_permission)
            
            return unix_path
            
        except PathHandlerError:
            raise
        except Exception as e:
            raise InvalidPathError(
                "Path validation failed",
                path=Path(str(path)),
                original_error=e
            )
    
    def normalize(
        self,
        path: Union[str, Path, PathLike],
        *,
        make_absolute: bool = True,
        resolve_symlinks: bool = True
    ) -> Path:
        """Normalize a path to Unix format.
        
        Args:
            path: The path to normalize
            make_absolute: Whether to convert to absolute path
            resolve_symlinks: Whether to resolve symbolic links
            
        Returns:
            Path: Normalized path
            
        Raises:
            InvalidPathError: If path cannot be normalized
        """
        try:
            # Convert to string first
            path_str = str(path)
            
            # Convert backslashes to forward slashes
            path_str = path_str.replace('\\', '/')
            
            # Create path object based on platform
            if self._is_unix:
                unix_path = Path(path_str)
            else:
                # On Windows, we'll work with the path as-is
                unix_path = Path(path_str)
            
            # Make absolute if requested
            if make_absolute and not unix_path.is_absolute():
                unix_path = Path.cwd() / unix_path
            
            # Resolve symlinks if requested and supported
            if resolve_symlinks and self._is_unix:
                try:
                    unix_path = unix_path.resolve()
                except Exception:
                    # Ignore resolution errors on non-Unix systems
                    pass
            
            return unix_path
            
        except Exception as e:
            raise InvalidPathError(
                "Path normalization failed",
                path=Path(str(path)),
                original_error=e
            )
    
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
            required_permissions: Required permission mode
            follow_symlinks: Whether to follow symbolic links
            
        Returns:
            bool: True if path is accessible
        """
        try:
            # Get path string in proper format
            path_str = str(path.absolute())
            
            # Check basic existence
            if not os.path.exists(path_str):
                return False
            
            # Basic permission checks that work on both platforms
            if 'r' in required_permissions:
                if not os.access(path_str, os.R_OK, follow_symlinks=follow_symlinks):
                    return False
            
            if 'w' in required_permissions:
                if not os.access(path_str, os.W_OK, follow_symlinks=follow_symlinks):
                    return False
            
            if 'x' in required_permissions:
                if not os.access(path_str, os.X_OK, follow_symlinks=follow_symlinks):
                    return False
            
            return True
            
        except Exception as e:
            raise PathPermissionError(
                "Permission check failed",
                path=path,
                original_error=e
            )
    
    def get_path_info(self, path: Path) -> Dict[str, Any]:
        """Get detailed information about a path.
        
        Args:
            path: The path to analyze
            
        Returns:
            Dict containing comprehensive path information
            
        Raises:
            PathNotFoundError: If path doesn't exist
        """
        try:
            if not path.exists():
                raise PathNotFoundError("Path does not exist", path=path)
            
            # Get basic stats
            stats = path.stat()
            
            # Get owner and group info
            if self._is_unix:
                try:
                    owner = pwd.getpwuid(stats.st_uid).pw_name
                    group = grp.getgrgid(stats.st_gid).gr_name
                except (KeyError, NameError):
                    owner = str(stats.st_uid)
                    group = str(stats.st_gid)
            else:
                owner = "unknown"
                group = "unknown"
            
            # Get file type
            file_type = self._get_file_type(path)
            
            # Basic info that works on both platforms
            info = {
                'type': file_type,
                'size': stats.st_size,
                'permissions': {
                    'readable': os.access(path, os.R_OK),
                    'writable': os.access(path, os.W_OK),
                    'executable': os.access(path, os.X_OK)
                },
                'timestamps': {
                    'accessed': datetime.fromtimestamp(stats.st_atime),
                    'modified': datetime.fromtimestamp(stats.st_mtime),
                    'changed': datetime.fromtimestamp(stats.st_ctime)
                },
                'is_symlink': path.is_symlink()
            }
            
            # Add Unix-specific information if available
            if self._is_unix:
                info.update({
                    'owner': owner,
                    'group': group,
                    'mode_octal': oct(stats.st_mode)[-4:],
                    'device': {
                        'device_id': stats.st_dev,
                        'inode': stats.st_ino,
                        'hard_links': stats.st_nlink
                    }
                })
                
                if path.is_symlink():
                    info['symlink_target'] = os.readlink(path)
            
            return info
            
        except PathNotFoundError:
            raise
        except Exception as e:
            raise PathHandlerError(
                "Failed to get path info",
                path=path,
                original_error=e
            )
    
    def _get_file_type(self, path: Path) -> str:
        """Determine detailed file type.
        
        Args:
            path: Path to check
            
        Returns:
            String describing the file type
        """
        try:
            if path.is_symlink():
                return 'symlink'
            elif path.is_dir():
                return 'directory'
            elif path.is_file():
                return 'regular_file'
            else:
                if self._is_unix:
                    mode = path.stat().st_mode
                    if stat.S_ISFIFO(mode):
                        return 'fifo'
                    elif stat.S_ISSOCK(mode):
                        return 'socket'
                    elif stat.S_ISCHR(mode):
                        return 'character_device'
                    elif stat.S_ISBLK(mode):
                        return 'block_device'
                return 'unknown'
                
        except Exception:
            return 'unknown'