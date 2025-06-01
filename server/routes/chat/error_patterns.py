from enum import Enum
from typing import Optional, Dict, Any

class AnthropicErrorType(Enum):
    OVERLOADED = "overloaded_error"
    RATE_LIMIT = "rate_limit_error"
    CONTEXT_LENGTH = "context_length_exceeded"
    CONTENT_FILTER = "content_filtered"
    MODEL_UNAVAILABLE = "model_unavailable"
    INVALID_REQUEST = "invalid_request"
    INTERNAL_ERROR = "internal_server_error"
    TIMEOUT = "timeout_error"
    TOKEN_LIMIT = "token_limit_exceeded"

class ErrorPattern:
    def __init__(
        self,
        error_type: AnthropicErrorType,
        status_code: int,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        retryable: bool = False,
        retry_after: Optional[int] = None
    ):
        self.error_type = error_type
        self.status_code = status_code
        self.message = message
        self.details = details or {}
        self.retryable = retryable
        self.retry_after = retry_after

    def to_response(self) -> Dict[str, Any]:
        response = {
            "type": "error",
            "error": {
                "type": self.error_type.value,
                "message": self.message,
                "details": self.details
            }
        }
        if self.retry_after is not None:
            response["error"]["retry_after"] = self.retry_after
        return response

# Define common error patterns
ERROR_PATTERNS = {
    # System overload errors
    "overloaded": ErrorPattern(
        error_type=AnthropicErrorType.OVERLOADED,
        status_code=503,
        message="System is currently overloaded. Please try again later.",
        retryable=True,
        retry_after=30
    ),
    
    # Rate limiting errors
    "rate_limit": ErrorPattern(
        error_type=AnthropicErrorType.RATE_LIMIT,
        status_code=429,
        message="Rate limit exceeded. Please slow down your requests.",
        retryable=True,
        retry_after=60,
        details={"limit_type": "requests_per_minute"}
    ),
    
    # Context length errors
    "context_length": ErrorPattern(
        error_type=AnthropicErrorType.CONTEXT_LENGTH,
        status_code=400,
        message="The provided input exceeds the maximum context length.",
        retryable=False,
        details={
            "max_tokens": 100000,
            "current_tokens": 120000
        }
    ),
    
    # Content filtering
    "content_filter": ErrorPattern(
        error_type=AnthropicErrorType.CONTENT_FILTER,
        status_code=400,
        message="Your request was filtered due to content safety policies.",
        retryable=False,
        details={"filter_type": "content_safety"}
    ),
    
    # Model availability
    "model_unavailable": ErrorPattern(
        error_type=AnthropicErrorType.MODEL_UNAVAILABLE,
        status_code=503,
        message="The requested model is temporarily unavailable.",
        retryable=True,
        retry_after=300,
        details={"model": "claude-3-opus-20240229"}
    ),
    
    # Invalid requests
    "invalid_request": ErrorPattern(
        error_type=AnthropicErrorType.INVALID_REQUEST,
        status_code=400,
        message="The request was invalid or malformed.",
        retryable=False,
        details={"validation_errors": ["Invalid message format"]}
    ),
    
    # Internal server errors
    "internal_error": ErrorPattern(
        error_type=AnthropicErrorType.INTERNAL_ERROR,
        status_code=500,
        message="An internal server error occurred.",
        retryable=True,
        retry_after=10
    ),
    
    # Timeout errors
    "timeout": ErrorPattern(
        error_type=AnthropicErrorType.TIMEOUT,
        status_code=504,
        message="The request timed out.",
        retryable=True,
        retry_after=5
    ),
    
    # Token limit errors
    "token_limit": ErrorPattern(
        error_type=AnthropicErrorType.TOKEN_LIMIT,
        status_code=400,
        message="The response would exceed the maximum allowed tokens.",
        retryable=False,
        details={
            "max_tokens": 4096,
            "estimated_tokens": 4500
        }
    )
}