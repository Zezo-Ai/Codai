"""Base classes for tool implementations."""
from abc import ABCMeta, abstractmethod
from dataclasses import dataclass, fields, replace
from typing import Any, Literal, Optional, Dict

from anthropic.types.beta import BetaToolUnionParam

class BaseAnthropicTool(metaclass=ABCMeta):
    """Abstract base class for Anthropic-defined tools."""
    
    def __init__(self):
        self._callback = None
        self._tool_id = None
    
    def set_callback(self, callback):
        """Set the callback function for tool results."""
        self._callback = callback
    
    def set_tool_id(self, tool_id: str):
        """Set the tool ID for identification."""
        self._tool_id = tool_id
    
    def _handle_result(self, result: "ToolResult") -> "ToolResult":
        """Process result through callback if one is set."""
        if self._callback and result:
            self._callback(result, self._tool_id or self.__class__.__name__)
        return result

    @abstractmethod
    def __call__(self, **kwargs) -> Any:
        """Executes the tool with the given arguments."""
        ...

    @abstractmethod
    def to_params(
        self,
    ) -> BetaToolUnionParam:
        raise NotImplementedError

class BaseEditor(BaseAnthropicTool):
    """Base editor class for file operations."""
    
    def __init__(self):
        super().__init__()
        
    @abstractmethod
    def read_file(self, path: str) -> str:
        """Read file content."""
        pass
        
    @abstractmethod
    def write_file(self, path: str, content: str) -> None:
        """Write content to file."""
        pass

@dataclass(kw_only=True, frozen=True)
class ToolResult:
    """Represents the result of a tool execution."""
    output: Optional[str] = None
    error: Optional[str] = None
    base64_image: Optional[str] = None
    system: Optional[str] = None
    format: Literal['cli', 'web'] = 'cli'
    metadata: Optional[Dict] = None

    def __bool__(self):
        return any(
            getattr(self, field.name) 
            for field in fields(self) 
            if field.name not in ['format', 'metadata']
        )

    def __add__(self, other: "ToolResult"):
        def combine_fields(
            field: Optional[str],
            other_field: Optional[str],
            concatenate: bool = True
        ):
            if field and other_field:
                if concatenate:
                    return field + other_field
                raise ValueError("Cannot combine tool results")
            return field or other_field

        return ToolResult(
            output=combine_fields(self.output, other.output),
            error=combine_fields(self.error, other.error),
            base64_image=combine_fields(
                self.base64_image, 
                other.base64_image, 
                False
            ),
            system=combine_fields(self.system, other.system),
            format=self.format,  # Keep original format
            metadata=self.metadata or other.metadata  # Prefer original metadata
        )

    def replace(self, **kwargs):
        """Returns a new ToolResult with the given fields replaced."""
        return replace(self, **kwargs)

class CLIResult(ToolResult):
    """A ToolResult specifically formatted for CLI output."""
    def __init__(self, **kwargs):
        kwargs['format'] = 'cli'
        super().__init__(**kwargs)

class WebResult(ToolResult):
    """A ToolResult specifically formatted for web output.
    
    Attributes:
        output: The content to be displayed
        metadata: Additional information including:
            - path: File path if applicable
            - lines: Line-by-line content with line numbers
            - code: Code-specific information if applicable
            - fileType: Type of the content
            - cli_output: Optional CLI formatted output
    """
    def __init__(self, **kwargs):
        # Process code content if applicable
        output = kwargs.get('output', '')
        metadata = kwargs.get('metadata', {})
        kwargs['format'] = 'web'
        
        if metadata.get('code'):
            # Code information already in metadata
            pass
        elif metadata.get('path'):
            # Import here to avoid circular import
            from .edit.code_processor import process_code
            
            # Process code if it's a file view
            code_info = process_code(
                content=output,
                file_path=metadata['path'],
                wrap=kwargs.get('wrap_code', True),
                add_line_numbers=kwargs.get('add_line_numbers', True)
            )
            
            metadata['code'] = {
                'language': code_info['language'],
                'display_name': code_info['display_name'],
                'features': code_info['features'],
                **code_info['metadata']
            }
            
            if code_info['metadata']['was_wrapped']:
                kwargs['output'] = code_info['content']
        
        kwargs['metadata'] = metadata
        super().__init__(**kwargs)

    @property
    def has_cli_output(self) -> bool:
        """Check if CLI output is available in metadata."""
        return bool(
            self.metadata 
            and self.metadata.get('cli_output')
        )

    @property
    def cli_output(self) -> Optional[str]:
        """Get CLI output if available."""
        return (
            self.metadata.get('cli_output')
            if self.has_cli_output
            else None
        )

class ToolFailure(ToolResult):
    """A ToolResult that represents a failure."""

class ToolError(Exception):
    """Raised when a tool encounters an error."""

    def __init__(self, message):
        self.message = message