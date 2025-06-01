"""Utility functions for path handling operations.

This module provides utility functions that support path handling operations
across different platforms. These functions are platform-agnostic where possible
and provide clear indicators when platform-specific behavior is implemented.

Note:
    These utilities focus on common path operations and validations that are
    useful across different path handling scenarios.
"""

import os
import platform
import string
from pathlib import Path
from typing import Union, Optional, List, Dict, Any, Tuple, Set
from urllib.parse import urlparse, unquote

from .constants import (
    WINDOWS_DRIVES,
    WINDOWS_PATH_LIMIT,
    INVALID_CHARS,
    RESERVED_NAMES
)
from .exceptions import (
    PathHandlerError,
    InvalidPathError,
    PathLengthError
)


def is_windows() -> bool:
    """Check if current platform is Windows.
    
    Returns:
        bool: True if running on Windows
    """
    return platform.system().lower() == 'windows'


def is_path_absolute(path: Union[str, Path]) -> bool:
    """Check if path is absolute in a platform-aware manner.
    
    Args:
        path: Path to check
        
    Returns:
        bool: True if path is absolute
        
    Note:
        Handles both Windows and Unix path formats
    """
    path_str = str(path)
    
    if is_windows():
        # Check for drive letter (C:\) or UNC (\\server)
        return bool(
            (len(path_str) >= 2 and path_str[1] == ':') or
            path_str.startswith('\\\\')
        )
    else:
        # Unix-style absolute path
        return path_str.startswith('/')


def normalize_separators(path: str) -> str:
    """Normalize path separators for current platform.
    
    Args:
        path: Path string to normalize
        
    Returns:
        str: Path with normalized separators
    """
    if is_windows():
        # Convert forward slashes to backslashes on Windows
        return path.replace('/', '\\')
    else:
        # Convert backslashes to forward slashes on Unix
        return path.replace('\\', '/')


def get_path_components(path: Union[str, Path]) -> Tuple[str, List[str]]:
    """Split path into root and components.
    
    Args:
        path: Path to split
        
    Returns:
        Tuple containing:
            - Root (drive letter or root slash)
            - List of path components
            
    Example:
        >>> get_path_components("C:\\Users\\test")
        ('C:', ['Users', 'test'])
    """
    path_obj = Path(path)
    components = list(path_obj.parts)
    
    if not components:
        return '', []
        
    # Handle root based on platform
    if is_windows():
        root = components[0] if components[0].endswith(':') else ''
    else:
        root = '/' if path_obj.is_absolute() else ''
    
    # Remove root from components if present
    if root and components and components[0] == root:
        components = components[1:]
        
    return root, components


def join_path_components(
    root: str,
    components: List[str],
    *,
    normalize: bool = True
) -> str:
    """Join root and components into a path string.
    
    Args:
        root: Root component (drive letter or root slash)
        components: List of path components
        normalize: Whether to normalize separators
        
    Returns:
        str: Joined path string
        
    Example:
        >>> join_path_components("C:", ["Users", "test"])
        'C:\\Users\\test'  # On Windows
    """
    # Handle empty components
    if not components:
        return root
        
    # Join components
    path = os.path.join(root, *components)
    
    # Normalize separators if requested
    if normalize:
        path = normalize_separators(path)
        
    return path


def is_valid_filename(filename: str) -> bool:
    """Check if filename is valid for current platform.
    
    Args:
        filename: Filename to check
        
    Returns:
        bool: True if filename is valid
        
    Note:
        Checks platform-specific naming rules
    """
    try:
        # Check for empty or whitespace
        if not filename or filename.isspace():
            return False
            
        # Check length
        if len(filename) > 255:
            return False
            
        if is_windows():
            # Check Windows-specific rules
            name = filename.upper()
            if name in RESERVED_NAMES:
                return False
                
            # Check for invalid characters
            if any(c in INVALID_CHARS for c in filename):
                return False
                
        # Check for dots only
        if all(c == '.' for c in filename):
            return False
            
        return True
        
    except Exception:
        return False


def get_relative_path(
    path: Union[str, Path],
    start: Union[str, Path]
) -> str:
    """Get relative path from start path.
    
    Args:
        path: Target path
        start: Start path
        
    Returns:
        str: Relative path
        
    Example:
        >>> get_relative_path("C:\\Users\\test\\file.txt", "C:\\Users")
        'test\\file.txt'  # On Windows
    """
    try:
        path_obj = Path(path)
        start_obj = Path(start)
        
        relative = os.path.relpath(str(path_obj), str(start_obj))
        return normalize_separators(relative)
        
    except Exception as e:
        raise PathHandlerError(
            "Failed to get relative path",
            path=Path(str(path)),
            original_error=e
        )


def expand_path(path: Union[str, Path]) -> str:
    """Expand user home and environment variables in path.
    
    Args:
        path: Path to expand
        
    Returns:
        str: Expanded path
        
    Example:
        >>> expand_path("~/documents")
        '/home/user/documents'  # On Unix
    """
    try:
        expanded = os.path.expanduser(str(path))
        expanded = os.path.expandvars(expanded)
        return normalize_separators(expanded)
        
    except Exception as e:
        raise PathHandlerError(
            "Failed to expand path",
            path=Path(str(path)),
            original_error=e
        )


def clean_path(path: Union[str, Path]) -> str:
    """Clean and normalize path string.
    
    Args:
        path: Path to clean
        
    Returns:
        str: Cleaned path string
        
    Note:
        - Removes redundant separators
        - Normalizes case on Windows
        - Resolves relative components
    """
    try:
        # Convert to string and normalize separators
        path_str = normalize_separators(str(path))
        
        # Remove redundant separators
        while '\\\\' in path_str:
            path_str = path_str.replace('\\\\', '\\')
        while '//' in path_str:
            path_str = path_str.replace('//', '/')
            
        # Normalize case on Windows
        if is_windows() and ':' in path_str:
            drive, rest = path_str.split(':', 1)
            path_str = f"{drive.upper()}:{rest}"
            
        # Resolve relative components
        path_obj = Path(path_str)
        return str(path_obj.resolve())
        
    except Exception as e:
        raise PathHandlerError(
            "Failed to clean path",
            path=Path(str(path)),
            original_error=e
        )


def parse_path_url(url: str) -> str:
    """Parse file URL into path string.
    
    Args:
        url: File URL to parse
        
    Returns:
        str: Path string
        
    Example:
        >>> parse_path_url("file:///C:/Users/test")
        'C:\\Users\\test'  # On Windows
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme != 'file':
            raise InvalidPathError(
                f"Invalid URL scheme: {parsed.scheme}",
                path=Path(url)
            )
            
        # Get path component and decode
        path = unquote(parsed.path)
        
        # Handle Windows drive letters
        if is_windows() and path.startswith('/'):
            path = path[1:]  # Remove leading slash
            
        return normalize_separators(path)
        
    except Exception as e:
        raise PathHandlerError(
            "Failed to parse path URL",
            path=Path(url),
            original_error=e
        )


def check_path_access(
    path: Union[str, Path],
    mode: str = 'r'
) -> Tuple[bool, Optional[str]]:
    """Check path accessibility with detailed error information.
    
    Args:
        path: Path to check
        mode: Access mode ('r', 'w', 'x')
        
    Returns:
        Tuple containing:
            - bool: True if accessible
            - Optional[str]: Error message if not accessible
    """
    path_obj = Path(path)
    
    try:
        # Check existence
        if not path_obj.exists():
            return False, "Path does not exist"
            
        # Check read access
        if 'r' in mode and not os.access(path_obj, os.R_OK):
            return False, "Read permission denied"
            
        # Check write access
        if 'w' in mode and not os.access(path_obj, os.W_OK):
            return False, "Write permission denied"
            
        # Check execute access
        if 'x' in mode and not os.access(path_obj, os.X_OK):
            return False, "Execute permission denied"
            
        return True, None
        
    except Exception as e:
        return False, str(e)


def get_common_prefix(paths: List[Union[str, Path]]) -> str:
    """Get common path prefix from list of paths.
    
    Args:
        paths: List of paths
        
    Returns:
        str: Common prefix path
        
    Example:
        >>> get_common_prefix(["/a/b/c", "/a/b/d"])
        '/a/b'
    """
    if not paths:
        return ""
        
    # Convert all paths to same format
    normalized = [normalize_separators(str(p)) for p in paths]
    
    # Get path components
    split_paths = [p.split(os.sep) for p in normalized]
    
    # Find common prefix
    prefix = []
    for components in zip(*split_paths):
        if len(set(components)) != 1:
            break
        prefix.append(components[0])
        
    if not prefix:
        return ""
        
    return normalize_separators(os.sep.join(prefix))