"""File system editing tool implementation.

This module provides the EditTool class for file system operations,
with proper path handling and validation across different platforms.

Note:
    All file operations are performed with proper validation and
    safety checks.
"""

from pathlib import Path
from typing import List, Optional, Literal

from tools.edit.base_editor import BaseEditor
from tools.edit.commands import CommandHandler
from tools.edit.validators import PathValidator, Command, OutputFormat
from tools.edit.utils import maybe_truncate
from tools.edit.safe_operations import safe_str_replace, safe_insert, safe_edit
from tools.base import ToolError, ToolResult
from tools.path_handler import get_path_handler, PathHandlerError


class EditTool(BaseEditor):
    """An filesystem editor tool that allows the agent to view, create, and edit files.
    
    The tool parameters are defined by Anthropic and are not editable.
    All path operations are handled through a platform-specific path handler.
    
    Attributes:
        path_handler: Platform-specific path handler instance
    """

    def __init__(self) -> None:
        """Initialize EditTool with appropriate path handler."""
        super().__init__()
        self.path_handler = get_path_handler()

    async def __call__(
        self,
        *,
        command: Command,
        path: str,
        file_text: str | None = None,
        view_range: list[int] | None = None,
        old_str: str | None = None,
        new_str: str | None = None,
        insert_line: int | None = None,
        output_format: str = 'web',
        **kwargs,
    ):
        """Execute the requested file operation.
        
        Args:
            command: Operation to perform
            path: Target file path
            file_text: Content for file creation
            view_range: Line range for viewing
            old_str: String to replace
            new_str: Replacement string
            insert_line: Line number for insertion
            output_format: Output format ('web' or 'cli')
            **kwargs: Additional arguments
            
        Returns:
            ToolResult: Operation result
            
        Raises:
            ToolError: If operation fails
        """
        try:
            # Validate and normalize path
            _path = self.path_handler.validate(
                path,
                must_exist=(command != "create"),
                check_permissions=True,
                required_permission='w' if command in ["create", "str_replace", "insert"] else 'r'
            )
            
            # Validate command and format
            PathValidator.validate_command(command)
            PathValidator.validate_format(output_format)

            # Create make_output function with proper handling of extra arguments
            def make_output(content: str, desc: str, *args, **kwargs):
                # Combine all kwargs with output_format
                combined_kwargs = {'output_format': output_format, **kwargs}
                return self._make_output(content, desc, **combined_kwargs)

            # Handle different commands
            if command == "view":
                return await CommandHandler.view(
                    _path, 
                    view_range,
                    self.read_file,
                    make_output
                )
                
            elif command == "create":
                if not file_text:
                    raise ToolError("Parameter `file_text` is required for command: create")
                self.write_file(_path, file_text)
                self._file_history[_path].append(file_text)
                return ToolResult(output=f"File created successfully at: {_path}")
                
            elif command == "str_replace":
                if not old_str:
                    raise ToolError("Parameter `old_str` is required for command: str_replace")
                return await safe_str_replace(
                    edit_tool=self,
                    path=str(_path),
                    old_str=old_str,
                    new_str=new_str or "",
                    output_format=output_format
                )
                
            elif command == "insert":
                if insert_line is None:
                    raise ToolError("Parameter `insert_line` is required for command: insert")
                if not new_str:
                    raise ToolError("Parameter `new_str` is required for command: insert")
                return await safe_insert(
                    edit_tool=self,
                    path=str(_path),
                    insert_line=insert_line,
                    new_str=new_str,
                    output_format=output_format
                )
                
            # Note: undo_edit command is not supported in Claude 4
            else:
                raise ToolError(f"Unknown command: {command}")
                
        except PathHandlerError as e:
            raise ToolError(f"Path handling error: {str(e)}")


__all__ = ['EditTool', 'Command', 'safe_str_replace', 'safe_insert', 'safe_edit']