from pathlib import Path
from typing import Dict, Any, List, Optional, Union
from collections import defaultdict
from ..base import ToolError, ToolResult, CLIResult
from ..logging_utils import log_path_operation, PathActionLogger

class BaseSystemOperator:
    """
    Base system operation handler class containing core functionality.
    Uses pathlib for modern path operations without sandbox restrictions.
    """
    _operation_history: dict[Path, list[str]]

    def __init__(self):
        self._operation_history = defaultdict(list)
        self.logger = PathActionLogger()
        
    def to_result(self, content: str, descriptor: str) -> str:
        """Generate consistent output format."""
        return f"Result of {descriptor}:\n{content}\n"
        
    def _resolve_path(self, path: Union[str, Path]) -> Path:
        """
        Resolve path string or Path object to absolute Path.
        Handles both absolute and relative paths.
        """
        if isinstance(path, str):
            path = Path(path)
        return path.absolute()

    @log_path_operation("read")
    def read_path(self, path: Union[str, Path]) -> Path:
        """Read path information without restrictions."""
        try:
            resolved_path = self._resolve_path(path)
            if not resolved_path.exists():
                self.logger.warning(f"Path does not exist: {resolved_path}")
            return resolved_path
        except Exception as e:
            raise ToolError(f"Error reading path {path}: {str(e)}") from None

    @log_path_operation("write")
    def write_path(self, path: Union[str, Path], content: str = ""):
        """Write/create path without restrictions."""
        try:
            resolved_path = self._resolve_path(path)
            self._operation_history[resolved_path].append(str(resolved_path))
        except Exception as e:
            raise ToolError(f"Error writing path {path}: {str(e)}") from None