"""Shared type definitions for conversation handling."""

"""Type definitions and validation for conversation handling.

This module contains the core type definitions used throughout the conversation
handling system, with runtime validation and proper error handling.

Note:
    All classes in this module are immutable and thread-safe. They provide
    comprehensive validation and error handling suitable for production use.
    
Example:
    >>> from typing import Dict, Any
    >>> msg = ContentBlock.from_dict({
    ...     "type": "text",
    ...     "text": "Hello",
    ...     "metadata": {"key": "value"}
    ... })
"""

# Version and constants
__version__ = "1.0.0"
MAX_MESSAGE_LENGTH = 32768  # Maximum length of a single message
MIN_TOKENS_PER_MESSAGE = 1  # Minimum tokens in a message
DEFAULT_CACHE_TTL = 3600   # Default cache TTL in seconds

from typing import List, Dict, Any, TypedDict, Literal, Optional, cast
from dataclasses import dataclass, field
from datetime import datetime, UTC
import json

class ConversationError(Exception):
    """Base class for all conversation-related errors."""
    pass

class ValidationError(ConversationError):
    """Raised when conversation validation fails."""
    pass

class StateError(ConversationError):
    """Raised when conversation state is invalid."""
    pass

class TokenError(ConversationError):
    """Base class for token-related errors."""
    pass

class TokenCountError(TokenError):
    """Base class for token counting errors."""
    pass

class TokenValidationError(TokenCountError):
    """Raised when token validation fails."""
    pass

class TokenLimitError(TokenCountError):
    """Raised when token limits are exceeded."""
    pass

class CacheControl(TypedDict):
    """
    Cache control settings for content blocks.
    
    Controls how content blocks are cached and processed. Ephemeral blocks
    are not persisted between summarizations.
    """
    type: Literal["ephemeral", "permanent"]
    metadata: Optional[Dict[str, Any]]
    expires_at: Optional[datetime]

class ContentBlock(TypedDict):
    """
    Individual content block in a conversation turn.
    
    Content blocks are the atomic units of conversation content. They can
    represent text, images, code, or tool interactions. Each block can have
    its own caching behavior.
    """
    type: Literal["text", "image", "code", "tool_result", "tool_use"]
    text: str
    cache_control: Optional[CacheControl]
    metadata: Optional[Dict[str, Any]]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ContentBlock":
        """Create a ContentBlock from a dictionary with validation."""
        if not isinstance(data, dict):
            raise ValidationError(f"Expected dict, got {type(data)}")
            
        if "type" not in data:
            raise ValidationError("Content block missing required 'type' field")
            
        if data["type"] not in ["text", "image", "code", "tool_result", "tool_use"]:
            raise ValidationError(f"Invalid content type: {data['type']}")
            
        if "text" not in data:
            raise ValidationError("Content block missing required 'text' field")
            
        return cast(ContentBlock, {
            "type": data["type"],
            "text": str(data["text"]),
            "cache_control": data.get("cache_control"),
            "metadata": data.get("metadata")
        })

class ConversationTurn(TypedDict):
    """Single turn in a conversation (user or assistant)."""
    role: Literal["user", "assistant"]
    content: List[ContentBlock]

@dataclass(frozen=True, slots=True)
class PreparedConversation:
    """
    Result of conversation preparation.
    
    A prepared conversation is a validated set of messages ready for API submission.
    It includes token counting information and state tracking for summarization
    decisions.
    
    Attributes:
        messages: List of prepared conversation turns
        token_count: Total token count of prepared messages
        needs_summary: Whether token count exceeds threshold
        has_summary: Whether messages already contain a summary
        preparation_time: Time taken to prepare messages in seconds
        state: Additional preparation state information
        created_at: Timestamp of preparation
        
    Example:
        >>> prep = PreparedConversation(
        ...     messages=[{"role": "user", "content": [{"type": "text", "text": "hi"}]}],
        ...     token_count=10,
        ...     needs_summary=False,
        ...     has_summary=False,
        ...     preparation_time=0.1,
        ...     state={"message_count": 1}
        ... )
    """
    messages: List[ConversationTurn]
    token_count: int
    needs_summary: bool
    has_summary: bool
    preparation_time: float
    state: Optional[Dict[str, Any]] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC), init=False)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "messages": self.messages,
            "token_count": self.token_count,
            "needs_summary": self.needs_summary,
            "has_summary": self.has_summary,
            "preparation_time": self.preparation_time,
            "state": self.state,
            "created_at": self.created_at.isoformat()
        }
        
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PreparedConversation":
        """Create instance from dictionary with validation."""
        try:
            # Validate required fields
            for field in ["messages", "token_count", "needs_summary", "has_summary", "preparation_time"]:
                if field not in data:
                    raise ValidationError(f"Missing required field: {field}")
                    
            # Validate types
            if not isinstance(data["messages"], list):
                raise ValidationError("Messages must be a list")
            if not isinstance(data["token_count"], int):
                raise ValidationError("Token count must be an integer")
            if not isinstance(data["needs_summary"], bool):
                raise ValidationError("needs_summary must be a boolean")
            if not isinstance(data["has_summary"], bool):
                raise ValidationError("has_summary must be a boolean")
            if not isinstance(data["preparation_time"], (int, float)):
                raise ValidationError("preparation_time must be a number")
                
            # Parse created_at if present
            created_at = datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.now(UTC)
                
            return cls(
                messages=data["messages"],
                token_count=data["token_count"],
                needs_summary=data["needs_summary"],
                has_summary=data["has_summary"],
                preparation_time=float(data["preparation_time"]),
                state=data.get("state"),
                created_at=created_at
            )
            
        except Exception as e:
            raise ValidationError(f"Error parsing PreparedConversation: {str(e)}")

    def __post_init__(self) -> None:
        """
        Validate the prepared conversation.
        
        This method validates:
        1. Required fields are present and valid
        2. Message structure is correct
        3. State is properly initialized
        
        Raises:
            ValidationError: If validation fails
        """
        try:
            # Validate required data
            if not self.messages:
                raise ValidationError("Prepared conversation must have messages")
            if self.token_count < 0:
                raise ValidationError("Token count cannot be negative")
            if self.preparation_time < 0:
                raise ValidationError("Preparation time cannot be negative")
                
            # Validate message structure
            for msg in self.messages:
                if not isinstance(msg, dict):
                    raise ValidationError(f"Invalid message format: {msg}")
                if "role" not in msg or "content" not in msg:
                    raise ValidationError(f"Message missing required fields: {msg}")
                if msg["role"] not in ["user", "assistant"]:
                    raise ValidationError(f"Invalid message role: {msg['role']}")
                if not isinstance(msg["content"], list):
                    raise ValidationError(f"Message content must be a list: {msg}")
                    
            # Create state if none provided
            if self.state is None:
                object.__setattr__(self, 'state', {
                    'message_count': len(self.messages),
                    'has_user_message': any(m['role'] == 'user' for m in self.messages),
                    'has_assistant_message': any(m['role'] == 'assistant' for m in self.messages),
                    'last_validated': datetime.now(UTC).isoformat(),
                    'validation_version': __version__
                })
                
        except Exception as e:
            if isinstance(e, ValidationError):
                raise
            raise ValidationError(f"Invalid PreparedConversation: {str(e)}")

@dataclass(frozen=True)
class SummarizationResult:
    """
    Result of conversation summarization.
    
    Attributes:
        messages: Summary pair messages (always 2 if successful: summary + acknowledgment)
        original_tokens: Token count before summarization
        summary_tokens: Token count after summarization
        compression_ratio: Ratio of summary_tokens to original_tokens
        was_successful: Whether summarization succeeded
        error: Error message if summarization failed
        
    Raises:
        ValueError: If summary is larger than original or other validation fails
    """
    messages: List[ConversationTurn]
    original_tokens: int
    summary_tokens: int
    compression_ratio: float
    was_successful: bool = True
    error: Optional[str] = None
    
    @classmethod
    def create_failed_result(cls, 
                           messages: List[ConversationTurn], 
                           original_tokens: int,
                           error: str) -> "SummarizationResult":
        """Create a failed summarization result."""
        return cls(
            messages=messages,
            original_tokens=original_tokens,
            summary_tokens=original_tokens,
            compression_ratio=1.0,
            was_successful=False,
            error=error
        )

    def __post_init__(self):
        """Validate the summarization result."""
        if self.was_successful:
            if len(self.messages) != 2:
                raise ValueError("Successful summarization must have exactly 2 messages (summary pair)")
            if self.compression_ratio > 1.0:
                raise ValueError("Compression ratio must be <= 1.0 for successful summarization")
            if self.original_tokens <= 0:
                raise ValueError("Original token count must be positive")
            if self.summary_tokens <= 0:
                raise ValueError("Summary token count must be positive")
        else:
            if not self.error:
                raise ValueError("Failed summarization must have error message")