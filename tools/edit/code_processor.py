"""Code language detection and processing utilities."""
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List, ClassVar

logger = logging.getLogger(__name__)

# Global code processor instance
_code_processor = None

def get_code_processor():
    """Get or create global code processor instance."""
    global _code_processor
    if _code_processor is None:
        _code_processor = CodeProcessor()
    return _code_processor

def process_code(
    content: str,
    file_path: Optional[str] = None,
    wrap: bool = True,
    add_line_numbers: bool = True
) -> Dict[str, Any]:
    """Process code content with language detection and formatting.
    
    Args:
        content: Code content to process
        file_path: Optional file path for language detection
        wrap: Whether to wrap code with language markers
        add_line_numbers: Whether to add line numbers
        
    Returns:
        Dict containing processed code information
    """
    processor = get_code_processor()
    return processor.process_code(
        content,
        file_path,
        wrap,
        add_line_numbers
    )

class CodeProcessor:
    """Handle code language detection and processing."""
    
    # Extension to language mapping
    _extension_map: ClassVar[Dict[str, str]] = {
        # Programming Languages
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.jsx': 'javascript',
        '.java': 'java',
        '.cpp': 'cpp',
        '.c': 'c',
        '.cs': 'csharp',
        '.go': 'go',
        '.rb': 'ruby',
        '.php': 'php',
        '.rs': 'rust',
        '.scala': 'scala',
        '.swift': 'swift',
        '.kt': 'kotlin',
        
        # Web Technologies
        '.html': 'html',
        '.htm': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.sass': 'sass',
        '.less': 'less',
        '.vue': 'vue',
        '.svelte': 'svelte',
        
        # Data Formats
        '.json': 'json',
        '.yml': 'yaml',
        '.yaml': 'yaml',
        '.xml': 'xml',
        '.csv': 'csv',
        '.toml': 'toml',
        '.ini': 'ini',
        
        # Documentation
        '.md': 'markdown',
        '.rst': 'restructuredtext',
        '.tex': 'latex',
        '.txt': 'text',
        
        # Shell Scripts
        '.sh': 'shell',
        '.bash': 'shell',
        '.zsh': 'shell',
        '.fish': 'shell',
        '.ps1': 'powershell',
        '.bat': 'batch',
        '.cmd': 'batch',
        
        # Configuration
        '.env': 'dotenv',
        '.conf': 'config',
        '.cfg': 'config',
        
        # Other
        '.sql': 'sql',
        '.graphql': 'graphql',
        '.proto': 'protobuf'
    }
    
    def __init__(self) -> None:
        """Initialize CodeProcessor with logger configuration."""
        self.logger = logging.getLogger(__name__)
        self._init_feature_map()
    
    def _init_feature_map(self) -> None:
        """Initialize language feature mapping."""
        self._feature_map: Dict[str, Dict[str, Any]] = {
            'python': {
                'supports_highlighting': True,
                'has_formatter': True,
                'supports_linting': True,
                'documentation_url': 'https://docs.python.org/',
                'common_extensions': ['.py', '.pyw', '.pyx'],
                'frameworks': ['Django', 'Flask', 'FastAPI', 'Pyramid']
            },
            'javascript': {
                'supports_highlighting': True,
                'has_formatter': True,
                'supports_linting': True,
                'documentation_url': 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
                'common_extensions': ['.js', '.jsx', '.mjs'],
                'frameworks': ['React', 'Vue', 'Angular', 'Node.js']
            },
            'typescript': {
                'supports_highlighting': True,
                'has_formatter': True,
                'supports_linting': True,
                'documentation_url': 'https://www.typescriptlang.org/docs/',
                'common_extensions': ['.ts', '.tsx'],
                'frameworks': ['Angular', 'Nest.js', 'Next.js']
            }
        }
    
    def detect_language(
        self,
        content: str,
        file_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """Detect code language and generate metadata."""
        language = 'text'  # Default fallback
        detection_method = 'fallback'
        
        try:
            # Try extension-based detection first
            if file_path:
                ext = Path(file_path).suffix.lower()
                if ext in self._extension_map:
                    language = self._extension_map[ext]
                    detection_method = 'extension'
                    self.logger.debug(
                        f"Language detected from extension: {language}"
                    )
            
            # Get language features
            features = self._get_language_features(language)
            
            return {
                'language': language,
                'display_name': language.title(),
                'detection_method': detection_method,
                'features': features,
                'metadata': {
                    'extension': Path(file_path).suffix if file_path else None,
                    'is_code': language != 'text',
                    'has_features': bool(features)
                }
            }
            
        except Exception as e:
            self.logger.error(f"Error detecting language: {str(e)}")
            return {
                'language': 'text',
                'display_name': 'Plain Text',
                'detection_method': 'error_fallback',
                'features': {},
                'metadata': {
                    'error': str(e),
                    'is_code': False,
                    'has_features': False
                }
            }
    
    def _get_language_features(self, language: str) -> Dict[str, Any]:
        """Get features for a specific language."""
        return self._feature_map.get(language, {})
    
    def wrap_code(
        self,
        content: str,
        language: str,
        add_line_numbers: bool = True
    ) -> str:
        """Wrap code content with language markers."""
        try:
            if add_line_numbers:
                # Add line numbers
                lines = content.split('\n')
                max_num_width = len(str(len(lines)))
                numbered_lines = [
                    f"{i+1:>{max_num_width}} | {line}"
                    for i, line in enumerate(lines)
                ]
                content = '\n'.join(numbered_lines)
            
            # Wrap with language marker
            return f"```{language}\n{content}\n```"
            
        except Exception as e:
            self.logger.error(f"Error wrapping code: {str(e)}")
            return content  # Return unwrapped on error
    
    def process_code(
        self,
        content: str,
        file_path: Optional[str] = None,
        wrap: bool = True,
        add_line_numbers: bool = True
    ) -> Dict[str, Any]:
        """Process code content with language detection and formatting."""
        # Detect language
        lang_info = self.detect_language(content, file_path)
        
        # Process content
        processed_content = (
            self.wrap_code(
                content,
                lang_info['language'],
                add_line_numbers
            )
            if wrap else content
        )
        
        return {
            'content': processed_content,
            'language': lang_info['language'],
            'display_name': lang_info['display_name'],
            'features': lang_info['features'],
            'metadata': {
                **lang_info['metadata'],
                'original_length': len(content),
                'processed_length': len(processed_content),
                'was_wrapped': wrap,
                'has_line_numbers': add_line_numbers
            }
        }