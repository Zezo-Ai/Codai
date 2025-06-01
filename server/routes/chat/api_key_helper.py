"""Helper functions for API key management"""

import os
from typing import Optional
from fastapi import Request, Header
import logging

from .api_key_storage import api_key_storage

logger = logging.getLogger(__name__)


def get_session_id(request: Request) -> str:
    """Get session ID from request"""
    # Try to get from various sources
    if hasattr(request, 'state'):
        # Check for session_id in state
        if hasattr(request.state, 'session_id'):
            return request.state.session_id
        
        # Check for session in state
        if hasattr(request.state, 'session') and hasattr(request.state.session, 'id'):
            return request.state.session.id
    
    # Check headers for session ID
    if 'X-Session-ID' in request.headers:
        return request.headers['X-Session-ID']
    
    # Generate based on IP as fallback
    client_ip = request.client.host if request.client else "unknown"
    return f"session_{client_ip}"


def get_api_key(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> str:
    """
    Get the API key with the following priority:
    1. User-provided key from Authorization header (for backward compatibility)
    2. Database-stored key for the session
    3. Environment variable ANTHROPIC_API_KEY
    
    Args:
        request: FastAPI request object
        authorization: Optional Authorization header
        
    Returns:
        API key string
        
    Raises:
        ValueError: If no API key is available
    """
    # Check for user-provided key in Authorization header (backward compatibility)
    if authorization and isinstance(authorization, str):
        # Expected format: "Bearer sk-ant-..."
        if authorization.startswith("Bearer "):
            user_key = authorization[7:]  # Remove "Bearer " prefix
            if user_key.startswith("sk-ant-"):
                logger.info("Using API key from Authorization header")
                return user_key
    
    # Try to get from database storage
    try:
        session_id = get_session_id(request)
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("User-Agent")
        
        db_key = api_key_storage.get_api_key(
            session_id=session_id,
            ip_address=client_ip,
            user_agent=user_agent
        )
        
        if db_key:
            logger.info(f"Using database-stored API key for session: {session_id}")
            return db_key
    except Exception as e:
        logger.warning(f"Failed to retrieve API key from database: {e}")
    
    # Fall back to environment variable
    env_key = os.environ.get("ANTHROPIC_API_KEY")
    if env_key:
        logger.info("Using environment variable API key")
        return env_key
    
    # No API key available
    raise ValueError(
        "API key required. Please add your Anthropic API key in Settings → API Keys to continue."
    )