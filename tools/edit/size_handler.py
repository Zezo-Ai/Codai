"""Size handling utilities for file operations.

This module provides comprehensive handlers for file size and content length
operations, with strict enforcement of limits during all operations.
"""

import logging
import io
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Generator, BinaryIO

from core.configuration import ToolConfig
from ..base import ToolError

def get_tool_config() -> Dict[str, Any]:
    """Get tool configuration in legacy format for compatibility."""
    return {
        'edit': {
            'options': {
                'max_file_size': ToolConfig.file_max_size(),
                'content_limits': ToolConfig.file_content_limits()
            }
        }
    }

class SizeLimitEnforcer:
    """Enforces size limits during file operations.
    
    This class provides strict enforcement of size limits during
    all file reading and processing operations.
    
    Attributes:
        max_size: Maximum allowed size in bytes
        max_length: Maximum allowed content length in chars
        accumulated_size: Current accumulated size
        accumulated_length: Current accumulated character length
    """
    
    def __init__(self, max_size: int, max_length: int) -> None:
        self.max_size = max_size
        self.max_length = max_length
        self.reset()
    
    def reset(self) -> None:
        """Reset accumulated counters."""
        self.accumulated_size = 0
        self.accumulated_length = 0
    
    def check_chunk(self, chunk: bytes) -> None:
        """Check if adding chunk would exceed limits.
        
        Args:
            chunk: Bytes to check
            
        Raises:
            ToolError: If limits would be exceeded
        """
        new_size = self.accumulated_size + len(chunk)
        if new_size > self.max_size:
            raise ToolError(
                f"Size limit exceeded: {new_size} bytes > {self.max_size} bytes"
            )
        
        # Try to decode for character length check
        try:
            content = chunk.decode('utf-8')
            new_length = self.accumulated_length + len(content)
            if new_length > self.max_length:
                raise ToolError(
                    f"Content length limit exceeded: {new_length} chars > {self.max_length} chars"
                )
        except UnicodeDecodeError:
            # If can't decode, use byte count as char count
            if new_size > self.max_length:
                raise ToolError(
                    f"Content length limit exceeded: {new_size} chars > {self.max_length} chars"
                )
    
    def accumulate(self, chunk: bytes) -> None:
        """Safely accumulate chunk size and length.
        
        Args:
            chunk: Bytes to accumulate
        """
        self.accumulated_size += len(chunk)
        try:
            self.accumulated_length += len(chunk.decode('utf-8'))
        except UnicodeDecodeError:
            self.accumulated_length += len(chunk)


class SizeHandler:
    """Handle all file size and content length operations.
    
    This class centralizes size-related functionality with strict
    limit enforcement during all operations.
    
    Attributes:
        logger: Logger instance for size operations
        SAMPLE_SIZE: Size of sample for content estimation
        READ_CHUNK_SIZE: Size of chunks for reading operations
    """
    
    SAMPLE_SIZE: int = 32768  # 32KB for sampling (increased 4x)
    READ_CHUNK_SIZE: int = 16384  # 16KB for reading (increased 4x)
    
    def __init__(self) -> None:
        """Initialize SizeHandler with logger configuration."""
        self.logger = logging.getLogger(__name__)
        self._enforcer: Optional[SizeLimitEnforcer] = None
    
    @property
    def enforcer(self) -> SizeLimitEnforcer:
        """Get or create size limit enforcer.
        
        Returns:
            SizeLimitEnforcer configured with current limits
        """
        if self._enforcer is None:
            limits = self._get_size_limits()
            self._enforcer = SizeLimitEnforcer(
                limits['max_file_size'],
                limits['max_content_length']
            )
        return self._enforcer

    def validate_content_size(self, content: str) -> Tuple[bool, Optional[str]]:
        """Validate content size against configured limits.
        
        Args:
            content: Content to validate
            
        Returns:
            Tuple containing:
                bool: Whether content size is valid
                Optional[str]: Error message if invalid
        """
        try:
            # Get size limits
            limits = self._get_size_limits()
            
            # Check byte size
            content_size = len(content.encode('utf-8'))
            if content_size > limits['max_file_size']:
                return False, (
                    f"Content size ({content_size} bytes) exceeds "
                    f"maximum allowed size ({limits['max_file_size']} bytes)"
                )
            
            # Check character length
            if len(content) > limits['max_content_length']:
                return False, (
                    f"Content length ({len(content)} chars) exceeds "
                    f"maximum allowed length ({limits['max_content_length']} chars)"
                )
            
            return True, None
            
        except Exception as e:
            return False, f"Content size validation failed: {str(e)}"

    def read_with_limits(self, path: Path) -> str:
        """Read file with strict size limit enforcement.
        
        Args:
            path: Path to read
            
        Returns:
            str: File contents within limits
            
        Raises:
            ToolError: If content exceeds limits
        """
        content_chunks = []
        self.enforcer.reset()
        
        try:
            with path.open('rb') as f:
                while True:
                    chunk = f.read(self.READ_CHUNK_SIZE)
                    if not chunk:
                        break
                    # Check before accumulating
                    self.enforcer.check_chunk(chunk)
                    self.enforcer.accumulate(chunk)
                    content_chunks.append(chunk)
                    
            return b''.join(content_chunks).decode('utf-8')
        except ToolError:
            raise
        except Exception as e:
            raise ToolError(f"Error reading {path}: {str(e)}")

    def read_range_with_limits(
        self,
        path: Path,
        start_line: int,
        end_line: int
    ) -> str:
        """Read specific line range with strict size limit enforcement.
        
        Args:
            path: Path to read from
            start_line: Starting line number (1-based)
            end_line: Ending line number (inclusive)
            
        Returns:
            str: Content of specified line range within limits
            
        Raises:
            ToolError: If range content exceeds limits
        """
        content_lines = []
        current_line = 0
        self.enforcer.reset()
        
        try:
            with path.open('rb') as f:
                # Skip lines before range
                for _ in range(start_line - 1):
                    line = f.readline()
                    if not line:
                        break
                    current_line += 1
                
                # Read required lines with limit enforcement
                while current_line < end_line:
                    line = f.readline()
                    if not line:
                        break
                    # Check before accumulating
                    self.enforcer.check_chunk(line)
                    self.enforcer.accumulate(line)
                    content_lines.append(line)
                    current_line += 1
                    
            return b''.join(content_lines).decode('utf-8')
        except ToolError:
            raise
        except Exception as e:
            raise ToolError(f"Error reading range from {path}: {str(e)}")

    def get_file_stats(self, path: Path) -> Dict[str, Any]:
        """Get comprehensive file statistics.
        
        Args:
            path: Path to analyze
            
        Returns:
            Dict containing file statistics
            
        Note:
            This only analyzes file stats without reading content
        """
        try:
            if not isinstance(path, Path) or not path.exists():
                return {
                    'basic': {
                        'size': 0,
                        'modified': 0,
                        'created': 0
                    },
                    'content': {
                        'avg_char_size': 1.0,
                        'estimated_length': 0,
                        'encoding': 'utf-8'
                    },
                    'limits': self._get_size_limits(),
                    'requires_chunking': False
                }
                
            stats = path.stat()
            limits = self._get_size_limits()
            file_size = stats.st_size
            content_stats = self._estimate_content_stats(path, file_size)
            
            return {
                'basic': {
                    'size': file_size,
                    'modified': stats.st_mtime,
                    'created': stats.st_ctime
                },
                'content': content_stats,
                'limits': limits,
                'requires_chunking': (
                    file_size > limits['max_file_size'] or 
                    content_stats['estimated_length'] > limits['max_content_length']
                )
            }
        except Exception as e:
            self.logger.error(f"Error analyzing file {path}: {str(e)}")
            raise

    def get_range_stats(
        self,
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
        """
        limits = self._get_size_limits()
        range_size = 0
        range_lines = []
        
        try:
            if not isinstance(path, Path) or not path.exists():
                return {
                    'range': {
                        'start': start_line,
                        'end': end_line,
                        'size': 0,
                        'length': 0
                    },
                    'limits': limits,
                    'requires_chunking': False
                }
                
            with path.open('rb') as f:
                # Sample the range content
                for _ in range(start_line - 1):
                    f.readline()
                
                for _ in range(end_line - start_line + 1):
                    line = f.readline()
                    if not line:
                        break
                    range_size += len(line)
                    range_lines.append(line)
                
            range_content = b''.join(range_lines).decode('utf-8')
            range_length = len(range_content)
            
            return {
                'range': {
                    'start': start_line,
                    'end': end_line,
                    'size': range_size,
                    'length': range_length
                },
                'limits': limits,
                'requires_chunking': (
                    range_size > limits['max_file_size'] or
                    range_length > limits['max_content_length']
                )
            }
        except Exception as e:
            self.logger.error(f"Error analyzing range for {path}: {str(e)}")
            raise

    def _estimate_content_stats(
        self,
        path: Path,
        file_size: int
    ) -> Dict[str, Any]:
        """Estimate content statistics from file sample.
        
        Args:
            path: Path to the file
            file_size: Size of file in bytes
            
        Returns:
            Dict containing content statistics
        """
        try:
            if not isinstance(path, Path) or not path.exists():
                return {
                    'avg_char_size': 1.0,
                    'estimated_length': 0,
                    'encoding': 'utf-8'
                }
                
            with path.open('rb') as f:
                sample_size = min(file_size, self.SAMPLE_SIZE)
                sample = f.read(sample_size)
                
                try:
                    sample_text = sample.decode('utf-8')
                    avg_char_size = len(sample) / len(sample_text)
                    estimated_length = int(file_size / avg_char_size)
                    encoding = 'utf-8'
                except UnicodeDecodeError:
                    self.logger.debug(f"Non-UTF-8 encoding detected for {path}")
                    avg_char_size = 1.0
                    estimated_length = file_size
                    encoding = 'unknown'
                    
                return {
                    'avg_char_size': avg_char_size,
                    'estimated_length': estimated_length,
                    'encoding': encoding
                }
        except Exception as e:
            self.logger.error(f"Error estimating content stats: {str(e)}")
            return {
                'avg_char_size': 1.0,
                'estimated_length': file_size,
                'encoding': 'error'
            }

    def _get_size_limits(self) -> Dict[str, int]:
        """Get configured size limits.
        
        Returns:
            Dict containing current size limits
        """
        config = get_tool_config()
        edit_config = config.get('edit', {}).get('options', {})
        content_limits = edit_config.get('content_limits', {})
        
        return {
            'max_file_size': edit_config.get('max_file_size', 8000000),  # Increased 4x
            'max_content_length': content_limits.get('max_length', 256000)  # Increased 4x
        }