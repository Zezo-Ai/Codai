"""AI API logging utilities with enhanced features."""

import time
from typing import Any, Dict, Optional, List
from datetime import datetime
from ..logging import get_logger
from ..logging.formatters import JsonFormatter

class AILogger:
    """Enhanced AI API interaction logger."""
    
    def __init__(self):
        """Initialize AI loggers with appropriate categories."""
        # Base loggers for general AI logs
        self.api_logger = get_logger('ai.api', 'ai', '_base')
        self.error_logger = get_logger('ai.errors', 'ai', '_base')
        # Specific feature loggers
        self.response_logger = get_logger('ai.responses', 'ai', 'chat')
        self.token_logger = get_logger('ai.tokens', 'ai', 'tokens')
    
    def log_request(
        self,
        model: str,
        messages: List[Any],
        system_prompt: str,
        request_id: str,
        extra: Optional[Dict[str, Any]] = None
    ) -> float:
        """Log AI API request with enhanced context.
        
        Args:
            model: Model identifier
            messages: Message history
            system_prompt: System prompt
            request_id: Unique request identifier
            extra: Additional request metadata
            
        Returns:
            float: Request start timestamp
        """
        start_time = time.time()
        
        request_data = {
            'request_id': request_id,
            'model': model,
            'timestamp': datetime.utcnow().isoformat(),
            'system_prompt': system_prompt,
            'message_count': len(messages),
            'total_prompt_length': sum(len(str(m.get('content', ''))) for m in messages),
            'start_time': start_time
        }
        
        if extra:
            request_data.update(extra)
            
        self.api_logger.info(
            'AI API Request',
            extra={
                'event_type': 'request',
                'data': request_data
            }
        )
        
        return start_time
    
    def log_response(
        self,
        request_id: str,
        response: Dict[str, Any],
        start_time: float,
        include_content: bool = True
    ) -> None:
        """Log AI API response with performance metrics.
        
        Args:
            request_id: Request identifier
            response: Response data
            start_time: Request start timestamp
            include_content: Whether to include full response content
        """
        duration = time.time() - start_time
        
        # Log response metadata
        response_data = {
            'request_id': request_id,
            'timestamp': datetime.utcnow().isoformat(),
            'duration_ms': duration * 1000,
            'token_usage': response.get('usage', {}),
            'finish_reason': response.get('finish_reason'),
            'response_size': len(str(response.get('content', ''))),
            'performance': {
                'tokens_per_second': response.get('usage', {}).get('total_tokens', 0) / duration
                if duration > 0 else 0
            }
        }
        
        self.api_logger.info(
            'AI API Response',
            extra={
                'event_type': 'response',
                'data': response_data
            }
        )
        
        # Log full response content separately if requested
        if include_content:
            content_data = {
                'request_id': request_id,
                'timestamp': datetime.utcnow().isoformat(),
                'content': response.get('content', []),
                'role': response.get('role', 'assistant'),
                'content_type': self._get_content_type(response.get('content', [])),
                'content_structure': self._analyze_content_structure(response.get('content', []))
            }
            
            self.response_logger.info(
                'AI Response Content',
                extra={
                    'event_type': 'content',
                    'data': content_data
                }
            )
    
    def log_error(
        self,
        error: Exception,
        request_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Log AI API error with enhanced context.
        
        Args:
            error: Exception that occurred
            request_id: Optional request identifier
            context: Additional error context
        """
        error_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'error_type': type(error).__name__,
            'error_message': str(error),
            'error_category': self._categorize_error(error)
        }
        
        if request_id:
            error_data['request_id'] = request_id
            
        if context:
            error_data['context'] = context
            
        self.error_logger.error(
            'AI API Error',
            exc_info=True,
            extra={
                'event_type': 'error',
                'data': error_data
            }
        )
    
    def log_rate_limit(
        self,
        request_id: str,
        limit_type: str,
        reset_time: Optional[float] = None
    ) -> None:
        """Log rate limit events with enhanced tracking.
        
        Args:
            request_id: Request identifier
            limit_type: Type of rate limit
            reset_time: Optional rate limit reset time
        """
        limit_data = {
            'request_id': request_id,
            'timestamp': datetime.utcnow().isoformat(),
            'limit_type': limit_type,
            'rate_limit_category': self._categorize_rate_limit(limit_type)
        }
        
        if reset_time:
            limit_data['reset_time'] = reset_time
            limit_data['wait_duration'] = reset_time - time.time()
            
        self.api_logger.warning(
            'AI API Rate Limit',
            extra={
                'event_type': 'rate_limit',
                'data': limit_data
            }
        )
    
    def log_token_usage(
        self,
        request_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
        cost: Optional[float] = None
    ) -> None:
        """Log token usage statistics with cost tracking.
        
        Args:
            request_id: Request identifier
            prompt_tokens: Number of prompt tokens
            completion_tokens: Number of completion tokens
            total_tokens: Total tokens used
            cache_creation_tokens: Number of tokens used for cache creation
            cache_read_tokens: Number of tokens read from cache
            cost: Optional cost of the request
        """
        usage_data = {
            'request_id': request_id,
            'timestamp': datetime.utcnow().isoformat(),
            'prompt_tokens': prompt_tokens,
            'completion_tokens': completion_tokens,
            'total_tokens': total_tokens,
            'cache_creation_tokens': cache_creation_tokens,
            'cache_read_tokens': cache_read_tokens,
            'token_distribution': {
                'prompt_percentage': (prompt_tokens / total_tokens * 100) if total_tokens > 0 else 0,
                'completion_percentage': (completion_tokens / total_tokens * 100) if total_tokens > 0 else 0,
                'cache_percentage': ((cache_creation_tokens + cache_read_tokens) / total_tokens * 100) if total_tokens > 0 else 0
            }
        }
        
        if cost is not None:
            usage_data['cost'] = cost
            usage_data['cost_per_token'] = cost / total_tokens if total_tokens > 0 else 0
            
        self.token_logger.info(
            'AI Token Usage',
            extra={
                'event_type': 'token_usage',
                'data': usage_data
            }
        )
    
    def _get_content_type(self, content: List[Any]) -> str:
        """Determine the type of content in the response."""
        if not content:
            return 'empty'
        
        content_types = set()
        for item in content:
            if isinstance(item, dict):
                content_types.add(item.get('type', 'unknown'))
            elif isinstance(item, str):
                content_types.add('text')
            else:
                content_types.add(f'unknown_{type(item).__name__}')
        
        return ','.join(sorted(content_types))
    
    def _analyze_content_structure(self, content: List[Any]) -> Dict[str, Any]:
        """Analyze the structure of response content."""
        return {
            'total_items': len(content),
            'type_distribution': self._get_type_distribution(content),
            'has_code': any(self._contains_code(item) for item in content),
            'has_tools': any(self._is_tool_content(item) for item in content)
        }
    
    def _get_type_distribution(self, content: List[Any]) -> Dict[str, int]:
        """Get distribution of content types."""
        distribution = {}
        for item in content:
            if isinstance(item, dict):
                item_type = item.get('type', 'unknown')
                distribution[item_type] = distribution.get(item_type, 0) + 1
            elif isinstance(item, str):
                distribution['text'] = distribution.get('text', 0) + 1
            else:
                unknown_type = f'unknown_{type(item).__name__}'
                distribution[unknown_type] = distribution.get(unknown_type, 0) + 1
        return distribution
    
    def _contains_code(self, item: Any) -> bool:
        """Check if content contains code."""
        if isinstance(item, dict):
            return item.get('type') == 'code' or 'code' in str(item.get('content', '')).lower()
        return False
    
    def _is_tool_content(self, item: Any) -> bool:
        """Check if content is tool-related."""
        if isinstance(item, dict):
            return item.get('type') in ['tool_use', 'tool_result']
        return False
    
    def _categorize_error(self, error: Exception) -> str:
        """Categorize the type of error."""
        error_type = type(error).__name__.lower()
        
        if 'timeout' in error_type:
            return 'timeout'
        elif 'connection' in error_type:
            return 'connection'
        elif 'authentication' in error_type or 'auth' in error_type:
            return 'authentication'
        elif 'validation' in error_type:
            return 'validation'
        elif 'rate' in error_type and 'limit' in error_type:
            return 'rate_limit'
        else:
            return 'other'
    
    def _categorize_rate_limit(self, limit_type: str) -> str:
        """Categorize the type of rate limit."""
        limit_type = limit_type.lower()
        
        if 'token' in limit_type:
            return 'token_limit'
        elif 'request' in limit_type:
            return 'request_limit'
        elif 'concurrent' in limit_type:
            return 'concurrent_limit'
        else:
            return 'other_limit'

# Global logger instance
ai_logger = AILogger()