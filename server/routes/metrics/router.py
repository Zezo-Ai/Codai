from fastapi import APIRouter
from fastapi.responses import JSONResponse
from typing import Dict, Any
from core.types.token_usage import TokenUsage
from core.config_manager import get_config
from debug.debug_logger import debug

router = APIRouter(tags=["metrics"])

class TokenMetricsStore:
    def __init__(self):
        self.config = get_config()
        self.current_session = TokenUsage()
        self.cache_hits = 0
        self.total_requests = 0
        self.history = []  # List of {total, timestamp, etc}
        self.reset_cache_metrics()
        
    def is_approaching_limit(self) -> bool:
        """Check if approaching token limit."""
        max_context = self.config.get('ai.models.claude3.max_context_tokens', 200000)
        threshold = self.config.get('ai.token_management.summary_triggers.threshold_percentage', 0.8)
        total_used = self.current_session.total_tokens
        percentage = (total_used / max_context)
        is_approaching = percentage > threshold
        
        # Log this check for debugging
        from debug.debug_logger import debug
        debug.log(
            event="metrics_token_threshold_check",
            data={
                "total_tokens": total_used,
                "max_context": max_context,
                "threshold": threshold,
                "current_percentage": percentage,
                "is_approaching_limit": is_approaching
            },
            category="TOKEN_THRESHOLDS"
        )
        
        return is_approaching
    
    def reset_cache_metrics(self):
        """Initialize/reset cache metrics"""
        self.cache_metrics = {
            "hits": 0,
            "creationTokens": 0,
            "readTokens": 0,
            "hitRate": 0
        }

    def update_from_usage(self, usage: TokenUsage) -> None:
        """Update metrics from a TokenUsage object."""
        from datetime import datetime, timezone
        
        # Update current session
        self.current_session.add_usage(usage)
        

        
        # Check token limits after update
        if self.is_approaching_limit() and self.config.get('ai.token_management.enable_summarization', True):
            max_context = self.config.get('ai.models.claude3.max_context_tokens', 200000)

            # TODO: Trigger summarization
            pass
        
        # Update cache metrics
        if usage.cache_read_tokens > 0:
            self.cache_hits += 1
        self.total_requests += 1
        
        # Update cache counts
        self.cache_metrics["hits"] = self.cache_hits
        self.cache_metrics["creationTokens"] += usage.cache_creation_tokens
        self.cache_metrics["readTokens"] += usage.cache_read_tokens
        self.cache_metrics["hitRate"] = self.cache_hits / self.total_requests if self.total_requests > 0 else 0
        
        # Add history entry
        history_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total": usage.total_tokens,
            "input": usage.input_tokens,
            "output": usage.output_tokens,
            "cache_creation": usage.cache_creation_tokens,
            "cache_read": usage.cache_read_tokens
        }
        self.history.append(history_entry)

    def to_dict(self) -> Dict[str, Any]:
        """Convert metrics store to API response format."""
        return {
            "currentSession": {
                "inputTokens": self.current_session.input_tokens,
                "outputTokens": self.current_session.output_tokens
            },
            "cache": self.cache_metrics,
            "history": self.history
        }

# Initialize metrics store
token_metrics = TokenMetricsStore()

@router.get("/api/metrics/tokens")
async def get_token_metrics():
    """Get current token metrics."""
    return JSONResponse(token_metrics.to_dict())