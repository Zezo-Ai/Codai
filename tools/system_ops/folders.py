from pathlib import Path
import shutil
import os
from datetime import datetime
from typing import List, Optional, Union, Literal
from .base_operator import BaseSystemOperator
from ..base import BaseAnthropicTool, ToolError, ToolResult, CLIResult
from ..logging_utils import log_path_operation, PathActionLogger

class FolderOperator(BaseSystemOperator, BaseAnthropicTool):
    """
    Custom folder operations handler with unrestricted system access.
    Implemented as a custom function tool.
    """
    
    def to_params(self):
        """Define tool parameters for Anthropic."""
        params = {
            "name": "folder_ops",
            "description": "Perform unrestricted folder operations with full system access.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": ["list", "create", "delete", "move", "copy", "info"],
                        "description": "The operation to perform: list (show contents), create (new folder), delete (remove file or folder), move (relocate file or folder), copy (duplicate file or folder), info (get details)"
                    },
                    "path": {
                        "type": "string",
                        "description": "The source path for the operation. Can be absolute or relative."
                    },
                    "target_path": {
                        "type": "string",
                        "description": "The target path for move/copy operations."
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "Whether to perform operation recursively. For delete: required when removing non-empty directories. For copy: determines whether to copy directory contents (true) or just create empty target directory (false). Ignored for file operations."
                    },
                    "create_parents": {
                        "type": "boolean",
                        "description": "Whether to create parent directories if they don't exist."
                    }
                },
                "required": ["operation", "path"]
            }
        }
        return params
    
    async def __call__(
        self,
        *,
        operation: Literal["list", "create", "delete", "move", "copy", "info"],
        path: Union[str, Path],
        target_path: Optional[Union[str, Path]] = None,
        recursive: bool = False,
        create_parents: bool = True,
        **kwargs,
    ) -> CLIResult:
        source_path = self._resolve_path(path)
        target_path = self._resolve_path(target_path) if target_path else None
        
        operations = {
            "list": self._handle_list,
            "create": self._handle_create,
            "delete": self._handle_delete,
            "move": self._handle_move,
            "copy": self._handle_copy,
            "info": self._handle_info
        }
        
        if operation not in operations:
            return CLIResult(error=f"Unknown operation: {operation}")
            
        handler = operations[operation]
        if operation in ["move", "copy"]:
            if not target_path:
                return CLIResult(error=f"target_path is required for {operation} operation")
            return await handler(source_path, target_path, recursive=recursive)
        elif operation == "create":
            return await handler(source_path, create_parents=create_parents)
        elif operation == "delete":
            return await handler(source_path, recursive=recursive)
        else:
            return await handler(source_path)
            
    @log_path_operation("list")
    async def _handle_list(self, path: Path) -> CLIResult:
        """List directory contents."""
        try:
            if not path.exists():
                return CLIResult(error=f"Path does not exist: {path}")
                
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
            
        except Exception as e:
            return CLIResult(error=f"Error listing directory {path}: {str(e)}")

    @log_path_operation("create")
    async def _handle_create(self, path: Path, create_parents: bool = True) -> CLIResult:
        """Create new directory."""
        try:
            path.mkdir(parents=create_parents, exist_ok=True)
            self._operation_history[path].append(f"created: {path}")
            return CLIResult(output=f"Directory created: {path}")
        except Exception as e:
            return CLIResult(error=f"Error creating directory {path}: {str(e)}")

    @log_path_operation("delete")
    async def _handle_delete(self, path: Path, recursive: bool = False) -> CLIResult:
        """Delete file or directory."""
        try:
            if not path.exists():
                return CLIResult(error=f"Path does not exist: {path}")
            
            # Handle file deletion
            if path.is_file():
                # Use unlink() to delete files
                path.unlink()
                self._operation_history[path].append(f"deleted: {path}")
                return CLIResult(output=f"File deleted: {path}")
            
            # Handle directory deletion
            else:
                if recursive:
                    shutil.rmtree(path)
                    self._operation_history[path].append(f"deleted recursively: {path}")
                    return CLIResult(output=f"Directory and its contents deleted: {path}")
                else:
                    try:
                        path.rmdir()
                        self._operation_history[path].append(f"deleted: {path}")
                        return CLIResult(output=f"Directory deleted: {path}")
                    except OSError as e:
                        if "not empty" in str(e).lower():
                            return CLIResult(error=f"Directory is not empty: {path}. Use recursive=True to delete with contents.")
                        raise
        except Exception as e:
            return CLIResult(error=f"Error deleting {path}: {str(e)}")

    @log_path_operation("move")
    async def _handle_move(self, source: Path, target: Path, recursive: bool = True) -> CLIResult:
        """Move file or directory to new location."""
        try:
            if not source.exists():
                return CLIResult(error=f"Source path does not exist: {source}")
            
            # Ensure target parent directory exists
            target.parent.mkdir(parents=True, exist_ok=True)
            
            # Use shutil.move which handles both files and directories
            shutil.move(str(source), str(target))
            
            # Record the operation with appropriate message
            self._operation_history[source].append(f"moved to: {target}")
            
            # Return appropriate message based on source type
            if source.is_file():
                return CLIResult(output=f"File moved: {source} -> {target}")
            else:
                return CLIResult(output=f"Directory moved: {source} -> {target}")
        except Exception as e:
            # Generic error message covering both files and directories
            return CLIResult(error=f"Error moving {source} to {target}: {str(e)}")

    @log_path_operation("copy")
    async def _handle_copy(self, source: Path, target: Path, recursive: bool = True) -> CLIResult:
        """Copy file or directory to new location."""
        try:
            if not source.exists():
                return CLIResult(error=f"Source path does not exist: {source}")
            
            # Ensure target parent directory exists
            target.parent.mkdir(parents=True, exist_ok=True)
                
            # Handle files and directories differently
            if source.is_file():
                # For files, use copy2 to preserve metadata
                shutil.copy2(str(source), str(target))
                self._operation_history[source].append(f"copied to: {target}")
                return CLIResult(output=f"File copied: {source} -> {target}")
            else:
                # For directories, respect the recursive flag
                if recursive:
                    # Use copytree with dirs_exist_ok for recursive directory copying
                    shutil.copytree(str(source), str(target), dirs_exist_ok=True)
                    self._operation_history[source].append(f"copied recursively to: {target}")
                    return CLIResult(output=f"Directory and its contents copied: {source} -> {target}")
                else:
                    # Without recursive, we can only copy directory itself (creates empty target)
                    target.mkdir(parents=True, exist_ok=True)
                    self._operation_history[source].append(f"copied (structure only) to: {target}")
                    return CLIResult(output=f"Directory structure copied (empty): {source} -> {target}")
        except Exception as e:
            # Generic error message covering both files and directories
            return CLIResult(error=f"Error copying {source} to {target}: {str(e)}")

    @log_path_operation("info")
    async def _handle_info(self, path: Path) -> CLIResult:
        """Get detailed file or directory information."""
        try:
            if not path.exists():
                return CLIResult(error=f"Path does not exist: {path}")
                
            stats = path.stat()
            info = {
                "name": path.name,
                "absolute_path": str(path.absolute()),
                "parent": str(path.parent),
                "exists": path.exists(),
                "is_directory": path.is_dir(),
                "is_file": path.is_file(),
                "is_symlink": path.is_symlink(),
                "size": f"{stats.st_size:,} bytes",
                "created": datetime.fromtimestamp(stats.st_ctime).isoformat(),
                "modified": datetime.fromtimestamp(stats.st_mtime).isoformat(),
                "accessed": datetime.fromtimestamp(stats.st_atime).isoformat(),
                "permissions": oct(stats.st_mode)[-3:],
                "readable": os.access(path, os.R_OK),
                "writable": os.access(path, os.W_OK),
                "executable": os.access(path, os.X_OK)
            }
            
            result = f"Information for: {path}\n"
            result += "=" * (24 + len(str(path))) + "\n"
            for key, value in info.items():
                result += f"{key}: {value}\n"
                
            return CLIResult(output=result)
        except Exception as e:
            return CLIResult(error=f"Error getting info for {path}: {str(e)}")