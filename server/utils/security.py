import re
import html
from pathlib import Path
from typing import Union, Any, Optional

class SecurityUtils:
    @staticmethod
    def sanitize_string(input_str: Optional[str]) -> str:
        """Sanitize string input to prevent XSS and other injection attacks."""
        if not isinstance(input_str, str):
            return ""
        # Remove null bytes
        cleaned = input_str.replace('\x00', '')
        # Escape HTML entities
        return html.escape(cleaned.strip())
    
    @staticmethod
    def sanitize_path(path: Union[str, Path]) -> Path:
        """Sanitize file path input to prevent path traversal attacks."""
        if isinstance(path, str):
            # Remove any null bytes and normalize path
            path = path.replace('\x00', '')
            path = Path(path).resolve()
        
        # Convert to Path object if not already
        if not isinstance(path, Path):
            path = Path(str(path))
        
        # Ensure path is absolute and normalized
        path = path.resolve()
        
        # Get the allowed root directory (project root)
        allowed_root = Path(__file__).parent.parent.parent
        
        try:
            # Ensure path is relative to allowed root
            path.relative_to(allowed_root)
        except ValueError:
            raise ValueError(f"Path {path} is outside of allowed directory {allowed_root}")
            
        return path
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Sanitize file name to prevent dangerous filenames."""
        if not isinstance(filename, str):
            return ""
            
        # Remove any null bytes
        filename = filename.replace('\x00', '')
        
        # Remove any path components
        filename = Path(filename).name
        
        # Remove any potentially dangerous characters
        filename = re.sub(r'[^a-zA-Z0-9._-]', '', filename)
        
        # Prevent hidden files
        filename = filename.lstrip('.')
        
        # Ensure reasonable length
        if len(filename) > 255:
            filename = filename[:255]
            
        return filename
    
    @staticmethod
    def is_safe_path(path: Union[str, Path]) -> bool:
        """Check if a path is safe to use."""
        try:
            sanitized_path = SecurityUtils.sanitize_path(path)
            return True
        except (ValueError, TypeError):
            return False

    @staticmethod
    def sanitize_content(content: Any) -> str:
        """Sanitize file content to prevent malicious content."""
        if not isinstance(content, (str, bytes)):
            return ""
            
        if isinstance(content, bytes):
            try:
                content = content.decode('utf-8')
            except UnicodeDecodeError:
                return ""
                
        # Remove null bytes
        content = content.replace('\x00', '')
        
        # Basic XSS prevention for text files
        content = html.escape(content)
        
        return content