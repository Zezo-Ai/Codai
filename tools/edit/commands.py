"""Command handling for file editing operations."""
from pathlib import Path
from typing import List, Optional, Dict, Callable, Any
from core.logging.tools import get_file_edit_logger
from ..base import ToolError, ToolResult, CLIResult, WebResult

# Get specialized logger for file editing operations
logger = get_file_edit_logger('commands')

class CommandHandler:
    """Handles individual command implementations for file operations."""
    
    @staticmethod
    async def create(
        path: Path,
        file_text: str,
        write_file: Callable[[Path, str], None],
        save_history: Callable[[Path, str], None]
    ) -> ToolResult:
        """Create a new file with content."""
        try:
            logger.info(
                "Creating new file",
                extra={
                    'path': str(path),
                    'content_length': len(file_text)
                }
            )
            
            # Check if file exists
            if path.exists():
                error_msg = f"File already exists at: {path}"
                logger.error(
                    "File creation failed - file exists",
                    extra={'path': str(path)}
                )
                return CLIResult(error=error_msg)
            
            # Ensure parent directory exists
            path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write file content
            try:
                write_file(path, file_text)
            except Exception as e:
                logger.error(
                    "Failed to write file",
                    extra={
                        'path': str(path),
                        'error': str(e)
                    }
                )
                return CLIResult(error=f"Failed to write file: {str(e)}")
            
            # Save to history
            save_history(path, file_text)
            
            logger.info(
                "File created successfully",
                extra={'path': str(path)}
            )
            return CLIResult(output=f"File created successfully at: {path}")
            
        except Exception as e:
            logger.error(
                "Error in create command",
                extra={
                    'path': str(path),
                    'error': str(e)
                }
            )
            return CLIResult(error=f"Error creating file {path}: {str(e)}")

    @staticmethod
    async def view(
        path: Path,
        view_range: Optional[List[int]],
        read_file: Callable[[Path], str],
        make_output: Callable[[str, str, Any], ToolResult]
    ) -> ToolResult:
        """View file contents with optional range."""
        try:
            logger.info(
                "Viewing file",
                extra={
                    'path': str(path),
                    'view_range': view_range
                }
            )
            
            if path.is_dir():
                items = list(path.glob("*"))
                folders = [f for f in items if f.is_dir()]
                files = [f for f in items if f.is_file()]
                
                result = f"Contents of directory: {path}\n"
                result += "=" * (24 + len(str(path))) + "\n"
                
                if folders:
                    result += "\nFolders:\n"
                    for folder in sorted(folders, key=lambda x: x.name):
                        result += f"  📁 {folder.name}\n"
                
                if files:
                    result += "\nFiles:\n"
                    for file in sorted(files, key=lambda x: x.name):
                        result += f"  📄 {file.name}\n"
                        
                return CLIResult(output=result)
            
            if not path.exists():
                error_msg = f"Path does not exist: {path}"
                logger.error(
                    "View failed - path not found",
                    extra={'path': str(path)}
                )
                return CLIResult(error=error_msg)
            
            try:
                if view_range:
                    # Validate and read range with size enforcement
                    if len(view_range) != 2 or not all(isinstance(i, int) for i in view_range):
                        raise ToolError(
                            "Invalid `view_range`. It should be a list of two integers."
                        )

                    start_line, end_line = view_range
                    content = read_file(path)
                    lines = content.splitlines()
                    if start_line < 1 or end_line > len(lines):
                        raise ToolError(
                            f"Line range {start_line}-{end_line} is out of bounds (1-{len(lines)})"
                        )
                    content = '\n'.join(lines[start_line-1:end_line])
                    return make_output(content, str(path), file_path=str(path), init_line=start_line)
                else:
                    content = read_file(path)
                    return make_output(content, str(path), file_path=str(path), init_line=1)
                    
            except Exception as e:
                logger.error(
                    "Failed to read file",
                    extra={
                        'path': str(path),
                        'error': str(e)
                    }
                )
                return CLIResult(error=f"Failed to read file: {str(e)}")
                
        except Exception as e:
            logger.error(
                "Error in view command",
                extra={
                    'path': str(path),
                    'error': str(e)
                }
            )
            return CLIResult(error=f"Error viewing {path}: {str(e)}")

    @staticmethod
    def str_replace(
        path: Path,
        old_str: str,
        new_str: str,
        read_file: Callable[[Path], str],
        write_file: Callable[[Path, str], None],
        make_output: Callable[[str, str, Any], ToolResult],
        save_history: Callable[[Path, str], None]
    ) -> ToolResult:
        """Replace text in a file."""
        try:
            logger.info(
                "Replacing text in file",
                extra={
                    'path': str(path),
                    'old_str_length': len(old_str),
                    'new_str_length': len(new_str)
                }
            )
            
            # Read current content
            try:
                content = read_file(path)
            except Exception as e:
                logger.error(
                    "Failed to read file for replacement",
                    extra={
                        'path': str(path),
                        'error': str(e)
                    }
                )
                return CLIResult(error=f"Failed to read file: {str(e)}")
            
            # Find occurrences
            occurrences = content.count(old_str)
            if occurrences == 0:
                error_msg = f"No replacement performed, old_str `{old_str}` did not appear verbatim in {path}."
                logger.error(
                    "Text replacement failed - text not found",
                    extra={
                        'path': str(path),
                        'old_str_length': len(old_str)
                    }
                )
                return CLIResult(error=error_msg)
            elif occurrences > 1:
                lines = content.splitlines()
                line_numbers = [
                    i + 1
                    for i, line in enumerate(lines)
                    if old_str in line
                ]
                error_msg = f"Multiple occurrences of old_str `{old_str}` in lines {line_numbers}. Please ensure it is unique"
                logger.error(
                    "Text replacement failed - multiple occurrences",
                    extra={
                        'path': str(path),
                        'occurrences': occurrences,
                        'lines': line_numbers
                    }
                )
                return CLIResult(error=error_msg)
            
            # Save old content to history
            save_history(path, content)
            
            # Perform replacement
            new_content = content.replace(old_str, new_str)
            try:
                write_file(path, new_content)
            except Exception as e:
                logger.error(
                    "Failed to write file after replacement",
                    extra={
                        'path': str(path),
                        'error': str(e)
                    }
                )
                return CLIResult(error=f"Failed to write file: {str(e)}")
            
            # Get context around replacement
            replacement_line = content.split(old_str)[0].count('\n')
            start_line = max(0, replacement_line - 4)
            end_line = replacement_line + 4 + new_str.count('\n')
            snippet = '\n'.join(new_content.splitlines()[start_line:end_line + 1])
            
            logger.info(
                "Text replacement successful",
                extra={
                    'path': str(path),
                    'line': replacement_line + 1
                }
            )
            
            return make_output(
                snippet,
                "snippet",
                file_path=str(path),
                init_line=start_line + 1
            )
            
        except Exception as e:
            logger.error(
                "Error in str_replace command",
                extra={
                    'path': str(path),
                    'error': str(e)
                }
            )
            return CLIResult(error=f"Error replacing text in {path}: {str(e)}")

    @staticmethod
    def insert(
        path: Path,
        insert_line: int,
        new_str: str,
        read_file: Callable[[Path], str],
        write_file: Callable[[Path, str], None],
        make_output: Callable[[str, str, Any], ToolResult],
        save_history: Callable[[Path, str], None]
    ) -> ToolResult:
        """Insert text at a specific line."""
        try:
            logger.info(
                "Inserting text in file",
                extra={
                    'path': str(path),
                    'line': insert_line,
                    'text_length': len(new_str)
                }
            )
            
            # Read current content
            try:
                content = read_file(path)
            except Exception as e:
                logger.error(
                    "Failed to read file for insertion",
                    extra={
                        'path': str(path),
                        'error': str(e)
                    }
                )
                return CLIResult(error=f"Failed to read file: {str(e)}")
            
            # Validate line number
            lines = content.splitlines()
            if insert_line < 0 or insert_line > len(lines):
                error_msg = f"Invalid line number {insert_line} (valid range: 0-{len(lines)})"
                logger.error(
                    "Text insertion failed - invalid line number",
                    extra={
                        'path': str(path),
                        'line': insert_line,
                        'max_line': len(lines)
                    }
                )
                return CLIResult(error=error_msg)
            
            # Save old content to history
            save_history(path, content)
            
            # Insert text
            new_lines = new_str.splitlines()
            result_lines = lines[:insert_line] + new_lines + lines[insert_line:]
            new_content = '\n'.join(result_lines)
            
            try:
                write_file(path, new_content)
            except Exception as e:
                logger.error(
                    "Failed to write file after insertion",
                    extra={
                        'path': str(path),
                        'error': str(e)
                    }
                )
                return CLIResult(error=f"Failed to write file: {str(e)}")
            
            # Get context around insertion
            start_line = max(0, insert_line - 4)
            end_line = insert_line + len(new_lines) + 4
            snippet = '\n'.join(result_lines[start_line:end_line])
            
            logger.info(
                "Text insertion successful",
                extra={
                    'path': str(path),
                    'line': insert_line,
                    'lines_inserted': len(new_lines)
                }
            )
            
            return make_output(
                snippet,
                "snippet",
                file_path=str(path),
                init_line=start_line + 1
            )
            
        except Exception as e:
            logger.error(
                "Error in insert command",
                extra={
                    'path': str(path),
                    'error': str(e)
                }
            )
            return CLIResult(error=f"Error inserting text in {path}: {str(e)}")

    @staticmethod
    def undo_edit(
        path: Path,
        file_history: Dict[Path, List[str]],
        read_file: Callable[[Path], str],
        write_file: Callable[[Path, str], None],
        make_output: Callable[[str, str, Any], ToolResult]
    ) -> ToolResult:
        """Undo last edit to a file."""
        try:
            logger.info(
                "Undoing last edit",
                extra={'path': str(path)}
            )
            
            if not file_history[path]:
                error_msg = f"No edit history found for {path}."
                logger.error(
                    "Undo failed - no history",
                    extra={'path': str(path)}
                )
                return CLIResult(error=error_msg)
            
            # Get previous content
            old_content = file_history[path].pop()
            
            try:
                write_file(path, old_content)
            except Exception as e:
                logger.error(
                    "Failed to write file during undo",
                    extra={
                        'path': str(path),
                        'error': str(e)
                    }
                )
                return CLIResult(error=f"Failed to write file: {str(e)}")
            
            logger.info(
                "Undo successful",
                extra={'path': str(path)}
            )
            
            return make_output(
                old_content,
                "restored content",
                file_path=str(path),
                init_line=1
            )
            
        except Exception as e:
            logger.error(
                "Error in undo command",
                extra={
                    'path': str(path),
                    'error': str(e)
                }
            )
            return CLIResult(error=f"Error undoing edit for {path}: {str(e)}")