"""Path handler constants for system-specific path operations.

This module contains all constant values used in path handling operations,
separated by operating system type and operation category.

Note:
    All constants follow system-specific requirements and limitations.
"""

import string
from typing import Dict, List, Set, Final

# Windows-specific constants
WINDOWS_DRIVES: Final[Set[str]] = set(f"{d}:" for d in string.ascii_letters.upper())
WINDOWS_PATH_LIMIT: Final[int] = 260
EXTENDED_PATH_PREFIX: Final[str] = "\\\\?\\"

# File system invalid characters and names
# Note: Excludes '\' (path separator) and ':' (drive letter) for Windows compatibility
INVALID_CHARS: Final[Set[str]] = set('<>"|?*')
INVALID_PATH_CHARS: Final[Set[str]] = set('<>"|?*/')  # Include forward slash for Windows paths
RESERVED_NAMES: Final[Set[str]] = {
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4',
    'LPT1', 'LPT2', 'LPT3', 'LPT4'
}

# File system specifications
SUPPORTED_FS_TYPES: Final[Dict[str, Dict[str, int | List[str]]]] = {
    'NTFS': {
        'max_path': 32767,
        'features': ['extended_length', 'compression', 'encryption']
    },
    'FAT32': {
        'max_path': 255,
        'features': []
    },
    'exFAT': {
        'max_path': 255,
        'features': ['compression']
    }
}

# Path operation modes
READ_MODE: Final[str] = 'read'
WRITE_MODE: Final[str] = 'write'
APPEND_MODE: Final[str] = 'append'

# Access permission constants
REQUIRED_PERMISSIONS: Final[Dict[str, str]] = {
    READ_MODE: 'r',
    WRITE_MODE: 'w',
    APPEND_MODE: 'a'
}

# File size limits (in bytes)
MAX_FILE_SIZE: Final[int] = 1024 * 1024 * 100  # 100MB default
MAX_PATH_SEGMENTS: Final[int] = 255  # Maximum number of path segments