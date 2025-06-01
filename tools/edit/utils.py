"""Utility functions for file editing operations."""
import logging
import sys
from pathlib import Path
from typing import Dict, Optional, Any, List, Generator, Tuple
from core.configuration import ToolConfig
from .size_handler import SizeHandler

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)

# Initialize size handler for consistent size management
_size_handler = SizeHandler()

def get_tool_config() -> Dict[str, Any]:
    """Get tool configuration in legacy format for compatibility."""
    return {
        'edit': {
            'options': {
                'content_limits': {
                    'max_length': ToolConfig.file_content_limits().get('max_length', 256000),
                    'chunk_size': ToolConfig.file_content_limits().get('chunk_size', 8000),
                    'truncation': {
                        'enabled': True,
                        'indicator': '... [Content truncated. Use view with range for specific sections]'
                    }
                }
            }
        }
    }

def get_file_stats(path: Path) -> Dict[str, Any]:
    """Get comprehensive file statistics.
    
    Args:
        path: Path to analyze
        
    Returns:
        Dict containing:
            basic: Basic file stats (size, timestamps)
            content: Content analysis (length, encoding)
            limits: Current configuration limits
            requires_chunking: Whether file needs chunked processing
            
    Note:
        Uses SizeHandler internally for consistent stats gathering.
    """
    return _size_handler.get_file_stats(path)

def get_range_stats(
    path: Path,
    start_line: int,
    end_line: int
) -> Dict[str, Any]:
    """Get statistics for a specific line range.
    
    Args:
        path: Path to analyze
        start_line: Starting line number (1-based)
        end_line: Ending line number (inclusive)
        
    Returns:
        Dict containing range-specific statistics
        
    Note:
        Uses SizeHandler internally for efficient range analysis.
    """
    return _size_handler.get_range_stats(path, start_line, end_line)

def read_line_range(
    path: Path,
    start_line: int,
    end_line: int
) -> str:
    """Read specific line range from file efficiently.
    
    Args:
        path: Path to read from
        start_line: Starting line number (1-based)
        end_line: Ending line number (inclusive)
        
    Returns:
        str: Content of specified line range
        
    Note:
        Uses efficient line reading to minimize memory usage.
    """
    return _size_handler._read_line_range(path, start_line, end_line)

def read_chunks(
    path: Path,
    chunk_size: Optional[int] = None
) -> Generator[str, None, None]:
    """Read file in chunks efficiently.
    
    Args:
        path: Path to read
        chunk_size: Optional custom chunk size
        
    Yields:
        str: Next chunk of file content
        
    Note:
        Uses efficient chunked reading to minimize memory usage.
    """
    return _size_handler.read_chunks(path, chunk_size)

def maybe_truncate(text: str, max_len: Optional[int] = None) -> str:
    """Truncate text if it exceeds max_len.
    
    Args:
        text: The text to potentially truncate
        max_len: Optional override for maximum length
        
    Returns:
        str: Original or truncated text with indicator
        
    Note:
        Uses configuration from get_tool_config() for default values
        and truncation settings.
    """
    config = get_tool_config()
    edit_config = config.get('edit', {}).get('options', {})
    content_limits = edit_config.get('content_limits', {})
    
    max_length = max_len or content_limits.get('max_length', 64000)  # Increased 4x
    truncation_config = content_limits.get('truncation', {})
    
    if len(text) > max_length and truncation_config.get('enabled', True):
        logger.debug(f"Truncating text from {len(text)} to {max_length} characters")
        indicator = truncation_config.get(
            'indicator',
            '... [Content truncated. Use view with range for specific sections]'
        )
        return text[:max_length] + indicator
        
    return text

def check_file_size(path: Path) -> Dict[str, Any]:
    """Check file size and content length against configured limits.
    
    Args:
        path: Path to the file to check
        
    Returns:
        Dict containing size check results including:
        - Physical file size
        - Estimated content length
        - Maximum limits
        - Whether limits are exceeded
        
    Note:
        Uses SizeHandler internally for consistent size checking.
    """
    return _size_handler.check_size_limits(path)

def get_chunk_size() -> int:
    """Get configured chunk size for ranged viewing.
    
    Returns:
        int: Default chunk size for ranged viewing
        
    Note:
        Used for determining appropriate chunk sizes for large files.
    """
    config = get_tool_config()
    view_range = config.get('edit', {}).get('options', {}).get(
        'content_limits', {}
    ).get('view_range', {})
    
    return view_range.get('default_chunk', 4000)  # Increased 4x

def get_size_limits() -> Dict[str, int]:
    """Get configured size limits.
    
    Returns:
        Dict containing:
            - max_file_size: Maximum file size in bytes
            - max_content_length: Maximum content length in chars
            
    Note:
        Uses SizeHandler internally for consistent limit handling.
    """
    return _size_handler._get_size_limits()

def suggest_chunks(path: Path, prefer_lines: bool = True) -> Dict[str, Any]:
    """Generate chunk suggestions for large files.
    
    Args:
        path: Path to analyze
        prefer_lines: Whether to prefer line-based chunks
        
    Returns:
        Dict containing chunk suggestions and strategies
        
    Note:
        Uses SizeHandler internally for efficient chunk calculation.
    """
    stats = get_file_stats(path)
    return _size_handler.suggest_chunks(stats, prefer_lines)

def validate_content_size(content: str) -> Tuple[bool, Optional[str]]:
    """Validate content size against configured limits.
    
    Args:
        content: Content to validate
        
    Returns:
        Tuple containing:
            bool: Whether content size is valid
            Optional[str]: Error message if invalid
            
    Note:
        Uses SizeHandler internally for consistent validation.
    """
    return _size_handler.validate_content_size(content)

def save_history(path: Path, content: str, file_history: Dict[Path, List[str]]) -> None:
    """Save file content to history.
    
    Args:
        path: File path
        content: Content to save
        file_history: History dictionary to update
        
    Note:
        Maintains history of file changes with debug logging.
    """
    logger.debug(f"[HISTORY DEBUG] Saving history for path: {path}")
    logger.debug(f"[HISTORY DEBUG] History object id: {id(file_history)}")
    logger.debug(f"[HISTORY DEBUG] Current history keys: {list(file_history.keys())}")
    
    file_history[path].append(content)
    
    logger.debug(f"[HISTORY DEBUG] After save - History length for {path}: {len(file_history[path])}")
    logger.debug(f"[HISTORY DEBUG] After save - History content types: {[type(c) for c in file_history[path]]}")