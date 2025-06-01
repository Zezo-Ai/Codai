"""Custom log handlers."""

import logging
import re
from typing import List, Pattern, Any

class SecurityHandler(logging.Handler):
    """Handler that masks sensitive information."""
    
    def __init__(self, patterns: List[str]):
        """Initialize with masking patterns.
        
        Args:
            patterns: List of regex patterns to mask
        """
        super().__init__()
        self.patterns = [re.compile(pattern) for pattern in patterns]
    
    def emit(self, record: logging.LogRecord) -> None:
        """Emit a masked log record."""
        record.msg = self._mask_sensitive_data(record.msg)
        if hasattr(record, 'extra_data'):
            record.extra_data = self._mask_sensitive_data(record.extra_data)
    
    def _mask_sensitive_data(self, data: Any) -> Any:
        """Mask sensitive information in data."""
        if isinstance(data, str):
            masked = data
            for pattern in self.patterns:
                masked = pattern.sub('[REDACTED]', masked)
            return masked
        elif isinstance(data, dict):
            return {k: self._mask_sensitive_data(v) for k, v in data.items()}
        elif isinstance(data, (list, tuple)):
            return [self._mask_sensitive_data(item) for item in data]
        return data