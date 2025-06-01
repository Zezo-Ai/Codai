"""AI-specific logging utilities."""

from typing import Any, Dict, Optional
from .manager import get_logger

def get_chat_logger(name: str):
    """Get logger for chat operations."""
    return get_logger(name, category='ai', subcategory='chat')

def get_inference_logger(name: str):
    """Get logger for model inference."""
    return get_logger(name, category='ai', subcategory='inference')

def get_prompt_logger(name: str):
    """Get logger for prompt handling."""
    return get_logger(name, category='ai', subcategory='prompts')

def get_token_logger(name: str):
    """Get logger for token usage tracking."""
    return get_logger(name, category='ai', subcategory='tokens')

def log_chat_interaction(logger, message: str, context: Dict[str, Any]):
    """Log a chat interaction with context."""
    logger.info(message, extra={
        'interaction_type': 'chat',
        'context': context
    })

def log_prompt_usage(logger, prompt_type: str, tokens: int, model: str):
    """Log prompt usage statistics."""
    logger.info(
        f"Prompt used: {prompt_type}",
        extra={
            'prompt_type': prompt_type,
            'tokens': tokens,
            'model': model
        }
    )

def log_token_usage(logger, operation: str, tokens: int, cost: float):
    """Log token usage and associated costs."""
    logger.info(
        f"Token usage for {operation}",
        extra={
            'operation': operation,
            'tokens': tokens,
            'cost': cost
        }
    )