"""Safe operations wrapper for edit tools."""

from pathlib import Path
from typing import Dict, Any, Optional
from core.logging import get_logger
from core.logging.tools import get_file_edit_logger
from ..base import BaseEditor, ToolError, CLIResult
from .commands import CommandHandler

# Get specialized logger for file editing operations
debug_logger = get_file_edit_logger('safe_operations')

async def safe_str_replace(
    edit_tool: BaseEditor,
    path: str,
    old_str: str,
    new_str: str,
    output_format: str = 'cli'
) -> CLIResult:
    """
    Safely perform string replacement operation.
    
    Args:
        edit_tool: Instance of BaseEditor or its subclass
        path: File path
        old_str: String to replace
        new_str: Replacement string
        output_format: Output format ('cli' or 'web')
        
    Returns:
        CLIResult: The result of the operation
    
    Notes:
        Automatically handles history and provides undo capability on failure.
    """
    debug_logger.info(
        "Starting str_replace operation",
        extra={
            'operation': 'str_replace',
            'path': path,
            'old_str_length': len(old_str),
            'new_str_length': len(new_str),
            'output_format': output_format
        }
    )
    
    try:
        # First validate file access
        debug_logger.debug(
            "Validating file access",
            extra={'path': path}
        )
        file_path = Path(path)
        if not file_path.exists():
            debug_logger.error(
                "File not found",
                extra={'path': path}
            )
            return CLIResult(error=f"File not found: {path}")
            
        # Read current content
        debug_logger.debug(
            "Reading file content",
            extra={'path': path}
        )
        try:
            current_content = edit_tool.read_file(file_path)
            debug_logger.debug(
                "File content read",
                extra={
                    'path': path,
                    'content_length': len(current_content)
                }
            )
        except Exception as e:
            debug_logger.error(
                "Failed to read file",
                extra={
                    'path': path,
                    'error': str(e)
                }
            )
            return CLIResult(error=f"Failed to read file: {str(e)}")
            
        # Validate replacement
        debug_logger.debug(
            "Validating replacement",
            extra={'path': path}
        )
        if old_str not in current_content:
            debug_logger.error(
                "Old string not found in file content",
                extra={
                    'path': path,
                    'old_str_length': len(old_str)
                }
            )
            return CLIResult(error="Old string not found in file content")
            
        # Perform replacement through safe_edit
        debug_logger.debug(
            "Performing safe edit",
            extra={'path': path}
        )
        result = await safe_edit(
            edit_tool=edit_tool,
            command="str_replace",
            path=path,
            old_str=old_str,
            new_str=new_str,
            output_format=output_format
        )
        
        debug_logger.info(
            "Operation completed successfully",
            extra={
                'path': path,
                'result': str(result)
            }
        )
        return result
        
    except Exception as e:
        debug_logger.error(
            "Operation failed",
            extra={
                'path': path,
                'error': str(e)
            }
        )
        return CLIResult(error=f"Operation failed: {str(e)}")

async def safe_insert(
    edit_tool: BaseEditor,
    path: str,
    insert_line: int,
    new_str: str,
    output_format: str = 'cli'
) -> CLIResult:
    """Safely perform insert operation."""
    debug_logger.info(
        "Starting insert operation",
        extra={
            'operation': 'insert',
            'path': path,
            'insert_line': insert_line,
            'new_str_length': len(new_str)
        }
    )
    return await safe_edit(
        edit_tool=edit_tool,
        command="insert",
        path=path,
        insert_line=insert_line,
        new_str=new_str,
        output_format=output_format
    )

async def safe_edit(
    edit_tool: BaseEditor, 
    command: str, 
    path: str, 
    output_format: str = 'cli',
    **kwargs
) -> CLIResult:
    """Safely edit a file using existing history and undo features."""
    _path = Path(path)
    debug_logger.info(
        "Starting safe_edit operation",
        extra={
            'operation': 'safe_edit',
            'command': command,
            'path': str(_path),
            'kwargs': kwargs
        }
    )
    
    try:
        def save_history(p: Path, content: str):
            edit_tool._file_history[p].append(content)
            debug_logger.debug(
                "History saved",
                extra={
                    'path': str(p),
                    'history_length': len(edit_tool._file_history[p])
                }
            )

        def make_output(content: str, desc: str, *args, **kwargs):
            combined_kwargs = {'output_format': output_format}
            if kwargs:
                combined_kwargs.update(kwargs)
            if args:
                combined_kwargs['init_line'] = args[0] if len(args) > 0 else 1
            return edit_tool._make_output(content, desc, **combined_kwargs)

        # Use CommandHandler directly with the correct save_history function
        if command == "str_replace":
            if not kwargs.get('old_str') or kwargs.get('new_str') is None:
                debug_logger.error(
                    "Missing required parameters",
                    extra={
                        'command': command,
                        'path': str(_path)
                    }
                )
                return CLIResult(error="Both old_str and new_str must be provided")
            
            return CommandHandler.str_replace(
                _path,
                kwargs['old_str'],
                kwargs['new_str'],
                edit_tool.read_file,
                edit_tool.write_file,
                make_output,
                save_history
            )
            
        elif command == "insert":
            if kwargs.get('insert_line') is None or not kwargs.get('new_str'):
                debug_logger.error(
                    "Missing required parameters",
                    extra={
                        'command': command,
                        'path': str(_path)
                    }
                )
                return CLIResult(error="Both insert_line and new_str must be provided")
                
            return CommandHandler.insert(
                _path,
                kwargs['insert_line'],
                kwargs['new_str'],
                edit_tool.read_file,
                edit_tool.write_file,
                make_output,
                save_history
            )
            
        else:
            debug_logger.error(
                "Unsupported command",
                extra={
                    'command': command,
                    'path': str(_path)
                }
            )
            return CLIResult(error=f"Unsupported command: {command}")

    except Exception as e:
        debug_logger.error(
            "Error occurred during safe_edit",
            extra={
                'command': command,
                'path': str(_path),
                'error': str(e)
            }
        )
        # If there's an error, try to undo
        try:
            debug_logger.info(
                "Attempting undo after error",
                extra={'path': str(_path)}
            )
            return CommandHandler.undo_edit(
                _path,
                edit_tool._file_history,
                edit_tool.read_file,
                edit_tool.write_file,
                make_output
            )
        except Exception as undo_error:
            debug_logger.error(
                "Undo operation failed",
                extra={
                    'path': str(_path),
                    'original_error': str(e),
                    'undo_error': str(undo_error)
                }
            )
            return CLIResult(
                error=f"Operation and undo both failed: {str(e)}. Undo error: {str(undo_error)}"
            )