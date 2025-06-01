from pathlib import Path
from .folders import FolderOperator

def get_folder_operator():
    """Get a configured folder operator instance."""
    return FolderOperator()

__all__ = ['FolderOperator', 'get_folder_operator', 'Path']