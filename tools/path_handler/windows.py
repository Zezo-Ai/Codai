"""Windows-specific path handling implementation.

This module provides Windows-specific path handling functionality, implementing
the abstract base class for path operations. It handles Windows-specific path
formats, drive letters, UNC paths, and filesystem operations.

Key features:
    - Complete Windows path handling
    - Drive letter management
    - UNC path support
    - Permission validation
    - File system attributes
    - Extended path support
    - Proper error handling

Note:
    This implementation handles Windows path specifics including:
    - Drive letters (C:, D:, etc.)
    - UNC paths (\\server\share)
    - Extended-length paths (\\?\)
    - Reserved names and character restrictions
    - File system attributes and permissions
    - Network paths
"""

import os
import stat
import string
import ctypes
import logging
from datetime import datetime
from pathlib import Path, WindowsPath, PureWindowsPath
from typing import Union, Dict, Any, Optional, Set, List, Tuple, cast

from .base import BasePathHandler, PathLike
from .constants import (
    WINDOWS_DRIVES,
    EXTENDED_PATH_PREFIX,
    INVALID_CHARS,
    INVALID_PATH_CHARS,
    RESERVED_NAMES,
    SUPPORTED_FS_TYPES
)
from .exceptions import (
    PathHandlerError,
    InvalidPathError,
    PathPermissionError,
    PathNotFoundError,
    PathTypeError,
    FileSystemError,
    PathLengthError
)

# Configure logger
logger = logging.getLogger(__name__)


class WindowsPathHandler(BasePathHandler):
    """Windows-specific path handler implementation.
    
    This class handles Windows path operations with proper support for:
    - Drive letter paths
    - UNC network paths
    - Extended-length paths
    - Windows-specific filesystem features
    - Permission validation
    - Path normalization
    
    Attributes:
        available_drives: Set of currently available drive letters
        _kernel32: Windows kernel32 API access (None if unavailable)
        logger: Module logger for debug information
    """
    
    def __init__(self) -> None:
        """Initialize the Windows path handler.
        
        Sets up:
            - Available drive letters
            - Windows API access
            - Logging configuration
        """
        super().__init__()
        self.logger = logger.getChild(self.__class__.__name__)
        
        # Initialize Windows API access
        try:
            self._kernel32 = ctypes.windll.kernel32
        except AttributeError:
            self._kernel32 = None
            self.logger.warning("Windows API (kernel32) not available")
        
        # Get available drives
        self.available_drives: Set[str] = self._get_available_drives()
        self.logger.debug(f"Available drives: {self.available_drives}")
    
    def validate(
        self,
        path: Union[str, Path, PathLike],
        *,
        must_exist: bool = True,
        check_permissions: bool = True,
        required_permission: str = 'r'
    ) -> WindowsPath:
        """Validate a Windows path for correctness and accessibility.
        
        Performs comprehensive validation including:
        - Path format validation
        - Drive letter validation
        - Component validation
        - Permission checking
        - Length validation
        
        Args:
            path: The path to validate
            must_exist: Whether the path must exist
            check_permissions: Whether to check permissions
            required_permission: Required permission mode
            
        Returns:
            WindowsPath: Validated Windows path object
            
        Raises:
            InvalidPathError: If path format is invalid
            PathNotFoundError: If path doesn't exist and must_exist is True
            PathPermissionError: If permission requirements not met
        """
        try:
            self.logger.debug(
                f"Validating path: {path} (must_exist={must_exist}, "
                f"check_permissions={check_permissions}, "
                f"required_permission={required_permission})"
            )
            
            # Convert to WindowsPath and normalize
            win_path = self.normalize(path)
            self.logger.debug(f"Normalized path: {win_path}")
            
            # For creation, parent must exist
            if not must_exist and required_permission == 'w':
                if not win_path.parent.exists():
                    raise PathNotFoundError(
                        "Parent directory does not exist",
                        path=win_path.parent
                    )
            # For other operations, path must exist if required
            elif must_exist and not win_path.exists():
                raise PathNotFoundError(
                    "Path does not exist",
                    path=win_path
                )
            
            # Validate path components
            self._validate_components(win_path)
            
            # Validate length
            self._validate_length(win_path)
            
            # Check permissions if required
            if check_permissions:
                self._validate_permissions(win_path, required_permission)
            
            self.logger.debug(f"Path validation successful: {win_path}")
            return win_path
            
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
    ) -> WindowsPath:
        """Normalize a path to Windows format.
        
        Handles:
        - Drive letter normalization
        - Separator normalization
        - UNC path handling
        - Absolute path conversion
        - Symlink resolution
        
        Args:
            path: The path to normalize
            make_absolute: Whether to convert to absolute path
            resolve_symlinks: Whether to resolve symbolic links
            
        Returns:
            WindowsPath: Normalized Windows path
            
        Raises:
            InvalidPathError: If path cannot be normalized
        """
        try:
            # Convert to string first
            path_str = str(path)
            self.logger.debug(f"Normalizing path: {path_str}")
            
            # Handle UNC paths
            if path_str.startswith(('\\\\', '//')):
                path_str = path_str.replace('/', '\\')
                self.logger.debug(f"Normalized UNC path: {path_str}")
                return WindowsPath(path_str)
            
            # Convert forward slashes to backslashes
            path_str = path_str.replace('/', '\\')
            
            # Handle drive letter paths
            if len(path_str) >= 2 and path_str[1] == ':':
                drive = path_str[0].upper() + ':'
                if drive in self.available_drives:
                    path_str = drive + path_str[2:]
                else:
                    # Use current drive if specified drive is not available
                    current_drive = os.getcwd()[:2]
                    self.logger.warning(
                        f"Drive {drive} not available, using current drive {current_drive}"
                    )
                    path_str = current_drive + path_str[2:]
            
            # Handle absolute paths without drive letter
            elif path_str.startswith('\\'):
                current_drive = os.getcwd()[:2]
                path_str = current_drive + path_str
            
            # Create WindowsPath object
            win_path = WindowsPath(path_str)
            
            # Make absolute if requested
            if make_absolute and not win_path.is_absolute():
                win_path = win_path.absolute()
            
            # Resolve symlinks if requested
            if resolve_symlinks:
                try:
                    win_path = win_path.resolve()
                except Exception as e:
                    self.logger.warning(f"Failed to resolve symlinks: {e}")
            
            self.logger.debug(f"Normalized result: {win_path}")
            return win_path
            
        except PathHandlerError:
            raise
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
        
        Performs comprehensive permission checking:
        - Read permissions
        - Write permissions
        - Execute permissions
        - Directory-specific checks
        - Parent directory permissions for new files
        
        Args:
            path: The path to check
            required_permissions: Required permission mode
            follow_symlinks: Whether to follow symbolic links
            
        Returns:
            bool: True if path is accessible
            
        Raises:
            PathPermissionError: If permission check fails
        """
        try:
            self.logger.debug(
                f"Checking access for path: {path} "
                f"(permissions={required_permissions}, "
                f"follow_symlinks={follow_symlinks})"
            )
            
            # For file creation, check parent directory permissions
            if not path.exists() and 'w' in required_permissions:
                parent = path.parent
                has_access = os.access(parent, os.W_OK)
                self.logger.debug(
                    f"Checking parent directory permissions: "
                    f"{parent} (has_access={has_access})"
                )
                return has_access
            
            # Get path string in proper format
            path_str = str(path.absolute())
            
            # Check basic existence
            if not os.path.exists(path_str):
                self.logger.debug(f"Path does not exist: {path_str}")
                return False
            
            # Check read permission
            if 'r' in required_permissions:
                if not os.access(path_str, os.R_OK, follow_symlinks=follow_symlinks):
                    self.logger.debug(f"No read permission: {path_str}")
                    return False
            
            # Check write permission
            if 'w' in required_permissions:
                if not os.access(path_str, os.W_OK, follow_symlinks=follow_symlinks):
                    self.logger.debug(f"No write permission: {path_str}")
                    return False
                    
                # Additional write check for directories
                if path.is_dir():
                    try:
                        test_file = path / '.write_test'
                        test_file.touch()
                        test_file.unlink()
                    except Exception as e:
                        self.logger.debug(f"Directory write test failed: {e}")
                        return False
            
            # Check execute permission
            if 'x' in required_permissions:
                if not os.access(path_str, os.X_OK, follow_symlinks=follow_symlinks):
                    self.logger.debug(f"No execute permission: {path_str}")
                    return False
            
            self.logger.debug(f"Access check successful: {path_str}")
            return True
            
        except Exception as e:
            raise PathPermissionError(
                "Permission check failed",
                path=path,
                original_error=e
            )
    
    def get_path_info(self, path: Path) -> Dict[str, Any]:
        """Get detailed information about a Windows path.
        
        Retrieves comprehensive path information including:
        - Basic attributes
        - File system details
        - Permissions
        - Timestamps
        - Windows-specific attributes
        
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
            
            self.logger.debug(f"Getting path info for: {path}")
            
            # Get basic stats
            stats = path.stat()
            
            # Get file type
            file_type = self._get_file_type(path)
            
            # Get file attributes
            attributes = self._get_file_attributes(path)
            
            # Get filesystem information
            drive = path.drive or os.getcwd()[:2]
            
            info = {
                'type': file_type,
                'size': stats.st_size,
                'drive': drive,
                'is_absolute': path.is_absolute(),
                'is_symlink': path.is_symlink(),
                'permissions': {
                    'readable': os.access(path, os.R_OK),
                    'writable': os.access(path, os.W_OK),
                    'executable': os.access(path, os.X_OK)
                },
                'timestamps': {
                    'created': datetime.fromtimestamp(stats.st_ctime),
                    'modified': datetime.fromtimestamp(stats.st_mtime),
                    'accessed': datetime.fromtimestamp(stats.st_atime)
                },
                'attributes': attributes,
                'parts': {
                    'drive': path.drive,
                    'root': path.root,
                    'name': path.name,
                    'stem': path.stem,
                    'suffix': path.suffix,
                    'parent': str(path.parent)
                }
            }
            
            self.logger.debug(f"Path info collected successfully: {path}")
            return info
            
        except PathNotFoundError:
            raise
        except Exception as e:
            raise PathHandlerError(
                "Failed to get path info",
                path=path,
                original_error=e
            )
    
    def _get_available_drives(self) -> Set[str]:
        """Get set of available Windows drive letters.
        
        Uses multiple methods to detect available drives:
        1. Windows API (GetLogicalDrives)
        2. Manual drive detection
        3. Current drive fallback
        
        Returns:
            Set[str]: Available drive letters (e.g., {'C:', 'D:'})
        """
        available = set()
        self.logger.debug("Detecting available drives")
        
        # Try GetLogicalDrives if kernel32 is available
        if self._kernel32:
            try:
                bitmask = self._kernel32.GetLogicalDrives()
                if bitmask != 0:
                    for letter in string.ascii_uppercase:
                        if bitmask & 1:
                            drive = f"{letter}:"
                            if os.path.exists(f"{drive}\\"):
                                available.add(drive)
                        bitmask >>= 1
                    self.logger.debug(f"Drives detected via API: {available}")
                    return available
            except Exception as e:
                self.logger.warning(f"Failed to get drives via API: {e}")
        
        # Manual check as fallback
        self.logger.debug("Falling back to manual drive detection")
        for drive in WINDOWS_DRIVES:
            try:
                if os.path.exists(f"{drive}\\"):
                    available.add(drive)
            except Exception:
                continue
        
        # Ensure current drive is included
        try:
            current_drive = os.getcwd()[:2]
            if current_drive.endswith(':'):
                available.add(current_drive)
        except Exception as e:
            self.logger.warning(f"Failed to get current drive: {e}")
        
        self.logger.debug(f"Available drives detected: {available}")
        return available
    
    def _validate_components(self, path: Path) -> None:
        """Validate Windows path components.
        
        Validates:
        - Drive letters
        - Path components
        - Reserved names
        - Invalid characters
        - UNC paths
        
        Args:
            path: Path to validate
            
        Raises:
            InvalidPathError: If path components are invalid
        """
        try:
            path_str = str(path)
            self.logger.debug(f"Validating path components: {path_str}")
            
            # Skip validation for UNC paths
            if path_str.startswith('\\\\'):
                self.logger.debug("Skipping validation for UNC path")
                return
            
            # Split path into components
            parts = path.parts
            
            # Validate drive letter if present
            if parts:
                drive = self._get_drive_letter(parts[0])
                if drive:
                    if drive not in self.available_drives:
                        current_drive = os.getcwd()[:2]
                        if current_drive in self.available_drives:
                            # Use current drive if available
                            self.logger.debug(
                                f"Using current drive {current_drive} "
                                f"instead of {drive}"
                            )
                            parts = (current_drive,) + parts[1:]
                        else:
                            raise InvalidPathError(
                                f"No valid drive available. "
                                f"Tried {drive} and {current_drive}",
                                path=path
                            )
            
            # Validate remaining components
            for part in parts[1:] if parts else []:
                # Skip empty parts or path separators
                if not part or part in ('\\', '/'):
                    continue
                
                # Check for invalid characters
                invalid_chars = set(part) & INVALID_CHARS
                if invalid_chars:
                    raise InvalidPathError(
                        f"Component '{part}' contains invalid characters: "
                        f"{invalid_chars}",
                        path=path
                    )
                
                # Check for reserved names
                name = part.split('.')[0].upper()
                if name in RESERVED_NAMES:
                    raise InvalidPathError(
                        f"Component '{part}' is a reserved name",
                        path=path
                    )
            
            self.logger.debug("Path components validation successful")
            
        except PathHandlerError:
            raise
        except Exception as e:
            raise InvalidPathError(
                "Component validation failed",
                path=path,
                original_error=e
            )
    
    def _get_drive_letter(self, path_part: str) -> str:
        """Extract drive letter from path component.
        
        Args:
            path_part: Path component potentially containing drive letter
            
        Returns:
            str: Normalized drive letter (e.g., 'C:') or empty string
        """
        if ':' in path_part:
            drive = path_part.split(':')[0].upper() + ':'
            self.logger.debug(f"Extracted drive letter: {drive}")
            return drive
        return ''
    
    def _validate_length(self, path: Path) -> None:
        """Validate path length against Windows limits.
        
        Handles:
        - Standard Windows MAX_PATH (260 characters)
        - Extended-length paths (32767 characters)
        - Conversion to extended path format
        
        Args:
            path: Path to validate
            
        Raises:
            PathLengthError: If path exceeds length limits
        """
        try:
            path_str = str(path.absolute())
            length = len(path_str)
            self.logger.debug(f"Checking path length: {length} chars")
            
            # Handle extended-length paths
            if path_str.startswith(EXTENDED_PATH_PREFIX):
                if length > 32767:  # Maximum extended path length
                    raise PathLengthError(
                        f"Extended path length ({length}) exceeds maximum (32767)",
                        path=path
                    )
            # Handle standard paths
            elif length > 260:  # Standard Windows MAX_PATH
                # Try to convert to extended path
                ext_path = f"{EXTENDED_PATH_PREFIX}{path_str}"
                if len(ext_path) > 32767:
                    raise PathLengthError(
                        f"Path length ({length}) exceeds maximum (260) and "
                        f"cannot be converted to extended format",
                        path=path
                    )
                self.logger.debug(
                    f"Path exceeds standard limit but can use extended format: "
                    f"{ext_path}"
                )
            
            self.logger.debug("Path length validation successful")
            
        except PathLengthError:
            raise
        except Exception as e:
            raise PathLengthError(
                "Path length validation failed",
                path=path,
                original_error=e
            )
    
    def _validate_permissions(
        self,
        path: Path,
        required_permission: str
    ) -> None:
        """Validate path permissions.
        
        For new files, checks parent directory permissions.
        For existing files, checks actual file permissions.
        
        Args:
            path: Path to validate
            required_permission: Required permission mode
            
        Raises:
            PathPermissionError: If permission requirements not met
        """
        try:
            self.logger.debug(
                f"Validating permissions for {path} "
                f"(required: {required_permission})"
            )
            
            # For file creation, check parent directory
            if not path.exists() and required_permission == 'w':
                parent = path.parent
                if not os.access(parent, os.W_OK):
                    raise PathPermissionError(
                        f"No write permission in parent directory: {parent}",
                        path=path
                    )
                self.logger.debug(
                    f"Parent directory permission check successful: {parent}"
                )
                return
            
            # For existing paths, check actual permissions
            if not self.check_access(path, required_permission):
                current_perms = []
                if os.access(path, os.R_OK):
                    current_perms.append('read')
                if os.access(path, os.W_OK):
                    current_perms.append('write')
                if os.access(path, os.X_OK):
                    current_perms.append('execute')
                
                raise PathPermissionError(
                    f"Insufficient permissions for {required_permission} access. "
                    f"Current permissions: "
                    f"{', '.join(current_perms) if current_perms else 'none'}",
                    path=path
                )
            
            self.logger.debug("Permission validation successful")
            
        except PathPermissionError:
            raise
        except Exception as e:
            raise PathPermissionError(
                "Permission validation failed",
                path=path,
                original_error=e
            )
    
    def _get_file_type(self, path: Path) -> str:
        """Determine detailed file type.
        
        Args:
            path: Path to check
            
        Returns:
            str: Description of file type
        """
        try:
            if path.is_symlink():
                return 'symlink'
            elif path.is_dir():
                return 'directory'
            elif path.is_file():
                return 'file'
            elif path.is_socket():
                return 'socket'
            elif path.is_block_device():
                return 'block_device'
            elif path.is_char_device():
                return 'character_device'
            else:
                return 'unknown'
        except Exception:
            return 'unknown'
    
    def _get_file_attributes(self, path: Path) -> Dict[str, bool]:
        """Get Windows-specific file attributes.
        
        Args:
            path: Path to check
            
        Returns:
            Dict[str, bool]: File attributes
            
        Note:
            Falls back to basic attributes if Windows API is unavailable
        """
        try:
            self.logger.debug(f"Getting file attributes for: {path}")
            
            if self._kernel32:
                attrs = self._kernel32.GetFileAttributesW(str(path))
                if attrs != -1:
                    attributes = {
                        'hidden': bool(attrs & 0x2),
                        'system': bool(attrs & 0x4),
                        'archive': bool(attrs & 0x20),
                        'temporary': bool(attrs & 0x100),
                        'compressed': bool(attrs & 0x800),
                        'encrypted': bool(attrs & 0x4000),
                        'readonly': bool(attrs & 0x1)
                    }
                    self.logger.debug(f"Attributes via API: {attributes}")
                    return attributes
            
            # Fallback to basic attributes
            self.logger.debug("Using fallback attribute detection")
            return {
                'hidden': path.name.startswith('.'),
                'system': False,
                'archive': False,
                'temporary': False,
                'compressed': False,
                'encrypted': False,
                'readonly': not os.access(path, os.W_OK)
            }
            
        except Exception as e:
            self.logger.warning(f"Failed to get file attributes: {e}")
            return {
                'hidden': False,
                'system': False,
                'archive': False,
                'temporary': False,
                'compressed': False,
                'encrypted': False,
                'readonly': True
            }