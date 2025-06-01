"""Token counting and management."""

"""Token counting and management with rate limiting and caching."""

from typing import List, Dict, Optional, Tuple
import time
from datetime import datetime, timedelta, UTC
from functools import lru_cache
from threading import Lock
from anthropic import Anthropic
from core.config_manager import get_config
from debug.debug_logger import debug
from core.configuration import DebugConfig
from .types import (
    ConversationTurn, TokenCountError, TokenValidationError, TokenLimitError
)
from core.configuration import (
    ModelConfig, APIConfig, ConversationConfig
)

# Get configuration values
MIN_TOKENS_PER_MESSAGE = 1
MAX_MESSAGE_LENGTH = APIConfig.max_message_length()

class RateLimiter:
    """Thread-safe rate limiter for API calls."""
    
    def __init__(self, requests_per_minute: int = 100):
        self.rate_limit = requests_per_minute
        self.window_size = 60  # seconds
        self.timestamps: List[datetime] = []
        self._lock = Lock()
        
    def acquire(self) -> Tuple[bool, float]:
        """
        Try to acquire rate limit token.
        
        Returns:
            Tuple of (success, wait_time)
        """
        with self._lock:
            now = datetime.now(UTC)
            window_start = now - timedelta(seconds=self.window_size)
            
            # Remove old timestamps
            self.timestamps = [ts for ts in self.timestamps if ts > window_start]
            
            if len(self.timestamps) >= self.rate_limit:
                # Calculate required wait time
                wait_time = (self.timestamps[0] - window_start).total_seconds()
                return False, wait_time
                
            self.timestamps.append(now)
            return True, 0.0

# TokenError classes moved to types.py

class RetrySettings:
    """Settings for retry behavior."""
    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 10.0,
        exponential_base: float = 2.0
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        
    def get_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt."""
        delay = self.base_delay * (self.exponential_base ** attempt)
        return min(delay, self.max_delay)

class TokenCounter:
    """
    Handles token counting using Anthropic's API with rate limiting and caching.
    
    This class provides thread-safe token counting with:
    - Rate limiting
    - Response caching
    - Exponential backoff retry
    - Comprehensive validation
    """
    
    def __init__(
        self,
        client: Anthropic,
        rate_limit: int = 100,
        retry_settings: Optional[RetrySettings] = None
    ):
        self.client = client
        self.config = get_config()
        self.model = self.config.get('ai.models.claude3.model_name', 'claude-3-7-sonnet-20250219')
        self.max_context_tokens = self.config.get('ai.models.claude3.max_context_tokens', 200000)
        self.max_tokens_per_message = self.config.get('ai.models.claude3.max_tokens_per_message', 8192)
        
        # Initialize components
        self.rate_limiter = RateLimiter(rate_limit)
        self.retry_settings = retry_settings or RetrySettings()
        self._cache = {}
        self._cache_lock = Lock()
        
    def _fix_tool_description(self, tool: Dict) -> str:
        """Generate a description if missing based on tool properties."""
        if "description" in tool:
            return tool["description"]
            
        # Try to generate a description from the tool properties
        if "input_schema" in tool and isinstance(tool["input_schema"], dict):
            schema = tool["input_schema"]
            if "description" in schema:
                return schema["description"]
                
        # Use name as fallback
        return f"Tool for {tool['name'].replace('_', ' ')}"
        
    def _fix_input_schema(self, tool: Dict) -> Dict:
        """Generate or fix input schema if missing or invalid."""
        if "input_schema" in tool and isinstance(tool["input_schema"], dict):
            return tool["input_schema"]
            
        # If it's the str_replace_editor, use its specific schema
        if tool["name"] == "str_replace_editor":
            return {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "enum": ["view", "create", "str_replace", "insert", "undo_edit"],
                        "description": "The commands to run."
                    },
                    "path": {
                        "type": "string",
                        "description": "Absolute path to file or directory"
                    },
                    "file_text": {
                        "type": "string",
                        "description": "Content for file creation"
                    },
                    "old_str": {
                        "type": "string",
                        "description": "Text to replace"
                    },
                    "new_str": {
                        "type": "string",
                        "description": "Replacement text"
                    }
                },
                "required": ["command", "path"]
            }
            
        # Create basic schema for other tools
        return {
            "type": "object",
            "properties": {},
            "description": f"Input schema for {tool['name']}"
        }

    def _prepare_tools_for_counting(self, tools: List[Dict]) -> List[Dict]:
        """
        Prepare tools schema for token counting API.
        Attempts to fix missing or invalid fields where possible.
        """
        if not tools:
            return []
            

        
        prepared_tools = []
        for i, tool in enumerate(tools):
            try:
                if not isinstance(tool, dict):
                    raise ValueError(f"Tool {i} must be a dictionary")
                    
                if "name" not in tool:
                    raise ValueError(f"Tool {i} missing required field 'name'")
                
                # Create fixed tool with required fields
                prepared_tool = {
                    "name": str(tool["name"]),
                    "description": self._fix_tool_description(tool),
                    "input_schema": self._fix_input_schema(tool)
                }
                

                
                prepared_tools.append(prepared_tool)
                
            except Exception as e:

                # Skip invalid tool rather than failing completely
                continue
            
        if not prepared_tools:

            return []
            
        return prepared_tools

    def count_tokens(
        self,
        messages: List[ConversationTurn],
        system: Optional[str] = None,
        tools: Optional[List[Dict]] = None,
        session_id: Optional[str] = None
    ) -> int:
        """
        Count tokens using Anthropic's API.
        
        Args:
            messages: List of messages to count
            system: Optional system prompt
            tools: Optional list of tools
            session_id: Optional session ID for logging
            
        Returns:
            int: Token count
        """
        """
        Get accurate token count using Anthropic's API.
        
        Args:
            messages: List of conversation turns to count
            system: Optional system prompt
            tools: Optional list of tools
            session_id: Optional session ID for logging
            
        Returns:
            int: Total token count
            
        Raises:
            TokenValidationError: If input validation fails
            TokenLimitError: If token limits are exceeded
            TokenCountError: For other token counting errors
        """
        # Input validation
        if not messages:
            raise TokenValidationError("Messages list cannot be empty")
            
        debug.log(
            event="token_count_start",
            session_id=session_id,
            data={"message_count": len(messages)},
            category="TOKEN_COUNTS_DETAILS"
        )
            
        for msg in messages:
            if not isinstance(msg, dict):
                raise TokenValidationError(f"Invalid message format: {msg}")
            if "role" not in msg or "content" not in msg:
                raise TokenValidationError(f"Message missing required fields: {msg}")
            if msg["role"] not in ["user", "assistant"]:
                raise TokenValidationError(f"Invalid message role: {msg['role']}")
            if not isinstance(msg["content"], list):
                raise TokenValidationError(f"Message content must be a list: {msg}")
        try:

            
            start_time = time.perf_counter()
            
            # Prepare API parameters
            params = {
                "model": self.model,
                "messages": messages,
            }
            
            # Add system if provided
            if system:
                params["system"] = system
                
            # Prepare and add tools if present
            if tools:
                prepared_tools = self._prepare_tools_for_counting(tools)
                if prepared_tools:  # Only add if we have valid tools
                    params["tools"] = prepared_tools
                    

            
            # Initialize retry state
            attempt = 0
            last_error = None
            
            while True:
                try:
                            # CRITICAL FIX: Check if messages contain thinking blocks
                    # If so, we need to enable thinking for the token count API call
                    try:
                        # Import here to avoid circular imports
                        from core.api.thinking_cleaner import contains_thinking_blocks
                        has_thinking = contains_thinking_blocks(messages)
                        
                        if has_thinking and "thinking" not in params:
                            # Enable thinking parameter for token counting
                            params["thinking"] = {
                                "type": "enabled",
                                "budget_tokens": 1024  # Minimal budget
                            }
                            
                            debug.log(
                                event="token_count_thinking_enabled",
                                session_id=session_id,
                                data={"reason": "Messages contain thinking blocks"},
                                category="TOKEN_COUNTS_DETAILS"
                            )
                    except ImportError:
                        # If import fails, just continue without thinking check
                        pass
                    except Exception as thinking_error:
                        # Log but continue if thinking check fails
                        debug.log(
                            event="token_count_thinking_check_error",
                            session_id=session_id,
                            data={"error": str(thinking_error)},
                            category="TOKEN_COUNTS_DETAILS"
                        )
                    
                    # Make API call and log response
                    response = self.client.messages.count_tokens(**params)
                    debug.log(
                        event="token_count_api_call",
                        session_id=session_id,
                        data={
                            "response": str(response),
                            "thinking_enabled": "thinking" in params
                        },
                        category="TOKEN_COUNTS_DETAILS"
                    )
                    
                    # Ensure we have input_tokens attribute
                    if not hasattr(response, 'input_tokens'):
                        debug.log(
                            event="token_count_error",
                            session_id=session_id,
                            data={"error": "Response missing input_tokens attribute"},
                            category="TOKEN_COUNTS_DETAILS"
                        )
                        raise TokenCountError("Response missing input_tokens")
                        
                    # Get and validate token count
                    token_count = response.input_tokens
                    debug.log(
                        event="token_count_validation",
                        session_id=session_id,
                        data={
                            "response": str(response),
                            "has_input_tokens": hasattr(response, 'input_tokens'),
                            "message_count": len(messages),
                            "has_system_prompt": bool(system),
                            "tool_count": len(tools) if tools else 0,
                            "token_count": token_count,
                            "token_count_type": str(type(token_count)),
                            "max_context": self.max_context_tokens
                        },
                        category="TOKEN_COUNTS"
                    )
                    
                    # Validate the count
                    if not isinstance(token_count, int):
                        if DebugConfig.should_log('LOG_TOKEN_COUNTS_DETAILS'):
                            debug.log(
                                event="token_count_error",
                                session_id=session_id,
                                data={
                                    "error_type": "invalid_type",
                                    "token_count": str(token_count),
                                    "actual_type": str(type(token_count))
                                }
                            )
                        raise TokenCountError(f"Invalid token count type: {type(token_count)}")
                        
                    if token_count < 0:
                        debug.log(
                            event="token_count_error",
                            session_id=session_id,
                            data={
                                "error_type": "negative_count",
                                "token_count": token_count
                            },
                            category="TOKEN_COUNTS_DETAILS"
                        )
                        raise TokenValidationError("Token count cannot be negative")
                        
                    if token_count > self.max_context_tokens:
                        debug.log(
                            event="token_count_error",
                            session_id=session_id,
                            data={
                                "error_type": "exceeds_limit",
                                "token_count": token_count,
                                "max_context": self.max_context_tokens
                            },
                            category="TOKEN_COUNTS_DETAILS"
                        )
                        raise TokenLimitError(
                            f"Token count {token_count} exceeds max context size "
                            f"{self.max_context_tokens}"
                        )
                    
                    # Add a user-friendly log for token count - only if approaching threshold
                    percentage = (token_count / self.max_context_tokens) * 100
                    
                    # Only log if token count approaches summarization threshold (>90% of threshold)
                    threshold = 0.01  # 1% threshold from config
                    token_threshold = self.max_context_tokens * threshold
                    
                    if token_count > (token_threshold * 0.5):  # Only log if >50% of threshold
                        debug.log(
                            event="token_count_approaching_threshold",
                            session_id=session_id,
                            data={
                                "message": f"TOKEN COUNT APPROACHING THRESHOLD: {token_count} tokens ({percentage:.1f}% of max, threshold at {token_threshold} tokens)",
                                "token_count": token_count,
                                "threshold_tokens": token_threshold,
                                "percentage_of_threshold": (token_count / token_threshold) * 100
                            },
                            category="SUMMARIZATION"
                        )
                    
                    return token_count
                    
                except TokenLimitError:
                    # Immediately re-raise token limit errors without retry
                    raise
                    
                except Exception as e:
                    last_error = e
                    attempt += 1
                    
                    if attempt >= self.retry_settings.max_retries:
                        if isinstance(last_error, TokenValidationError):
                            # Re-raise validation errors directly
                            raise last_error
                        raise TokenCountError(
                            f"Token counting failed after {attempt} attempts. "
                            f"Last error: {str(last_error)}"
                        )
                    
                    # Calculate and apply backoff delay
                    delay = self.retry_settings.get_delay(attempt)
                    time.sleep(delay)
            
        except Exception as e:

            raise

class TokenMetricsStore:
    """Store and analyze token usage metrics."""
    
    def __init__(self):
        self.config = get_config()
        self.max_context_tokens = self.config.get('ai.models.claude3.max_context_tokens', 200000)
        self.token_counts = {
            "pre_summary": [],
            "post_summary": [],
            "reductions": []
        }
    
    def _validate_token_counts(self, token_count: int) -> None:
        """
        Validate token counts against limits.
        
        Raises:
            TokenValidationError: If validation fails
            TokenLimitError: If limits are exceeded
        """
        if token_count < 0:
            raise TokenValidationError("Token count cannot be negative")
            
        if token_count > self.max_context_tokens:
            raise TokenLimitError(
                f"Token count {token_count} exceeds max context size {self.max_context_tokens}"
            )

    def check_token_limit(self, token_count: int) -> bool:
        """
        Check if token count exceeds configured threshold.
        
        Args:
            token_count: Number of tokens to check
            
        Returns:
            bool: Whether summarization is needed
            
        Raises:
            TokenValidationError: If token count is invalid
            TokenLimitError: If token count exceeds absolute maximum
        """
        from debug.debug_logger import debug
        
        # First check if summarization is enabled at all
        summarization_enabled = self.config.get('ai.token_management.enable_summarization')
        if summarization_enabled is not None and not summarization_enabled:
            debug.log(
                event="summarization_disabled_by_config",
                data={"token_count": token_count},
                category="SUMMARIZATION"
            )
            return False
            
        self._validate_token_counts(token_count)
        
        threshold_value = self.config.get('ai.token_management.summary_triggers.threshold_percentage')
        threshold = float(threshold_value if threshold_value is not None else 0.8)
        
        percentage = (token_count / self.max_context_tokens)
        should_summarize = percentage > threshold
        
        debug.log(
            event="token_limit_check",
            data={
                "token_count": token_count,
                "max_context": self.max_context_tokens,
                "threshold": threshold,
                "percentage": percentage,
                "should_summarize": should_summarize,
                "config_value": threshold_value
            },
            category="TOKEN_THRESHOLDS"
        )
        
        return should_summarize
    
    def record_summarization(
        self,
        pre_summary_tokens: int,
        post_summary_tokens: int,
        session_id: Optional[str] = None
    ):
        """Record token counts before and after summarization."""
        self.token_counts["pre_summary"].append(pre_summary_tokens)
        self.token_counts["post_summary"].append(post_summary_tokens)
        reduction = pre_summary_tokens - post_summary_tokens
        self.token_counts["reductions"].append(reduction)
        

    
    def get_efficiency_metrics(self) -> Dict:
        """Calculate summarization efficiency metrics."""
        if not self.token_counts["reductions"]:
            return {}
            
        metrics = {
            "average_reduction": sum(self.token_counts["reductions"]) / len(self.token_counts["reductions"]),
            "max_reduction": max(self.token_counts["reductions"]),
            "total_tokens_saved": sum(self.token_counts["reductions"]),
            "average_compression_ratio": sum(
                post / pre 
                for pre, post in zip(
                    self.token_counts["pre_summary"],
                    self.token_counts["post_summary"]
                )
            ) / len(self.token_counts["pre_summary"])
        }
        

        
        return metrics