"""Token usage tracking and metrics.

This module provides a standardized way to track and calculate token usage
across the application, including prompt, completion, and cache metrics.
"""

from dataclasses import dataclass, asdict
from typing import Dict, Any

@dataclass
class TokenUsage:
    """Tracks different types of token usage in API interactions."""
    
    input_tokens: int = 0            # New prompt tokens being processed
    output_tokens: int = 0           # Generated response tokens
    cache_creation_tokens: int = 0    # Tokens being written to cache
    cache_read_tokens: int = 0        # Tokens being read from cache

    @property
    def total_tokens(self) -> int:
        """Calculate total tokens (input + output)."""
        return self.input_tokens + self.output_tokens
    
    def add_usage(self, other: 'TokenUsage') -> None:
        """Add token counts from another TokenUsage object."""
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_creation_tokens += other.cache_creation_tokens
        self.cache_read_tokens += other.cache_read_tokens
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format for storage/serialization."""
        data = asdict(self)
        data['total_tokens'] = self.total_tokens
        return data
    
    @classmethod
    def from_api_usage(cls, usage: Any) -> 'TokenUsage':
        """Create TokenUsage from API response usage object."""
        return cls(
            input_tokens=getattr(usage, 'input_tokens', 0) or 0,
            output_tokens=getattr(usage, 'output_tokens', 0) or 0,
            cache_creation_tokens=getattr(usage, 'cache_creation_input_tokens', 0) or 0,
            cache_read_tokens=getattr(usage, 'cache_read_input_tokens', 0) or 0
        )
    
    @classmethod
    def from_dict(cls, data: Dict[str, int]) -> 'TokenUsage':
        """Create TokenUsage from a dictionary."""
        return cls(
            input_tokens=data.get('input_tokens', 0),
            output_tokens=data.get('output_tokens', 0),
            cache_creation_tokens=data.get('cache_creation_tokens', 0),
            cache_read_tokens=data.get('cache_read_tokens', 0)
        )