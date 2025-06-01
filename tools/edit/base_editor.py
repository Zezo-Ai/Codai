"""Base editor implementation for file operations."""
from pathlib import Path
from typing import Dict, Any, Optional, Literal, ClassVar, List
from collections import defaultdict
import os

from anthropic.types.beta import BetaToolTextEditor20241022Param
from tools.base import BaseAnthropicTool, ToolError, ToolResult, CLIResult, WebResult
from .utils import (
    maybe_truncate,
    check_file_size,
    get_chunk_size,
    get_size_limits,
    get_file_stats
)
from .size_handler import SizeHandler
from .code_processor import CodeProcessor
from core.configuration import get_tool_config

class BaseEditor(BaseAnthropicTool):
    """Base editor class containing core functionality.
    
    The tool parameters are defined by Anthropic and are not editable.
    Handles file operations with size limits and format awareness.
    """
    api_type: Literal["text_editor_20250429"] = "text_editor_20250429"
    name: Literal["str_replace_based_edit_tool"] = "str_replace_based_edit_tool"
    
    _file_history: ClassVar[Dict[Path, List[str]]] = defaultdict(list)
    _size_handler: ClassVar[SizeHandler] = SizeHandler()
    _code_processor: ClassVar[CodeProcessor] = CodeProcessor()

    def __init__(self) -> None:
        """Initialize BaseEditor instance."""
        super().__init__()

    def to_params(self) -> BetaToolTextEditor20241022Param:
        """Get tool parameters for API consumption."""
        return {
            "name": self.name,
            "type": self.api_type,
        }

    def read_file(self, path: Path) -> str:
        """Read the content of a file from a given path."""
        try:
            file_stats = self._size_handler.get_file_stats(path)
            
            if file_stats['requires_chunking']:
                suggested_chunk = min(
                    file_stats['limits']['max_file_size'] // 4,
                    file_stats['limits']['max_content_length']
                )
                raise ToolError(
                    f"File size ({file_stats['basic']['size']} bytes) or content length "
                    f"({file_stats['content']['estimated_length']} chars) exceeds limits.\n"
                    f"File size limit: {file_stats['limits']['max_file_size']} bytes\n"
                    f"Content length limit: {file_stats['limits']['max_content_length']} chars\n"
                    f"Suggested chunk size: {suggested_chunk} bytes\n"
                    "Use view with range to read specific sections."
                )
            
            content = self._size_handler.read_with_limits(path)
            # Normalize line endings to \n
            content = content.replace('\r\n', '\n')
            return content
            
        except ToolError:
            raise
        except Exception as e:
            raise ToolError(f"Error reading {path}: {str(e)}") from None

    def write_file(self, path: Path, content: str) -> None:
        """Write content to a file."""
        try:
            content_size = len(content.encode('utf-8'))
            limits = get_size_limits()
            
            if content_size > limits['max_file_size']:
                raise ToolError(
                    f"New content size ({content_size} bytes) would exceed "
                    f"maximum allowed size ({limits['max_file_size']} bytes)"
                )
            
            if len(content) > limits['max_content_length']:
                raise ToolError(
                    f"New content length ({len(content)} chars) would exceed "
                    f"maximum allowed length ({limits['max_content_length']} chars)"
                )
            
            # Normalize line endings to system default before writing
            if path.exists():
                # Read first to detect current line endings using UTF-8 encoding
                with path.open('r', newline='', encoding='utf-8') as f:
                    first_line = f.readline()
                    line_ending = '\r\n' if '\r\n' in first_line else '\n'
            else:
                # Use system default for new files
                line_ending = os.linesep
            
            # Replace all line endings with the target ending
            content = content.replace('\r\n', '\n').replace('\n', line_ending)
            
            # Write with detected/default line endings using UTF-8 encoding
            with path.open('w', newline='', encoding='utf-8') as f:
                f.write(content)
                
        except ToolError:
            raise
        except Exception as e:
            raise ToolError(f"Error writing to {path}: {str(e)}") from None
            
    def _make_output(
        self,
        content: str,
        description: str,
        output_format: str = 'cli',
        **kwargs
    ) -> ToolResult:
        """Format output based on requested format.
        
        Args:
            content: The content to format
            description: Description of the content
            output_format: Desired output format ('cli' or 'web')
            **kwargs: Additional formatting options
            
        Returns:
            ToolResult: Formatted output
        """
        try:
            # Get config
            config = get_tool_config()
            edit_config = config.get('edit', {}).get('options', {})
            
            # Handle CLI format
            if output_format == 'cli':
                return CLIResult(
                    output=f"Here's the content of {description}:\n{content}"
                )
            
            # For web format, process content and metadata
            file_path = kwargs.get('file_path')
            init_line = kwargs.get('init_line', 1)
            
            if file_path:
                # Process file content
                code_info = self._code_processor.process_code(
                    content=content,
                    file_path=str(file_path),
                    wrap=edit_config.get('code_processing', {}).get('wrap_code', True),
                    add_line_numbers=edit_config.get('code_processing', {}).get('add_line_numbers', True)
                )
                
                # Get file stats
                stats = get_file_stats(Path(file_path))
                
                # Build metadata
                metadata = {
                    'path': str(file_path),
                    'type': 'file',
                    'lines': [
                        {
                            'number': i + init_line,
                            'content': line,
                            'highlighted': False
                        }
                        for i, line in enumerate(content.split('\n'))
                    ],
                    'stats': stats,
                    'code': code_info
                }
                
                return WebResult(
                    output=code_info['content'] if code_info['metadata']['was_wrapped'] else content,
                    metadata=metadata
                )
            
            # Default to CLI format if no special handling needed
            return CLIResult(output=content)
            
        except Exception as e:
            return CLIResult(
                error=f"Error formatting output: {str(e)}"
            )