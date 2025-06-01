"""Logging middleware for web applications."""

import time
import uuid
from typing import Any, Callable, Optional
from .manager import get_logger

# Optional FastAPI support
try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.base import BaseHTTPMiddleware
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    BaseHTTPMiddleware = object  # type: ignore

class RequestLoggingMiddleware:
    """Middleware for logging HTTP requests and responses."""
    
    def __init__(self, app: Any = None):
        if FASTAPI_AVAILABLE and app is not None:
            self.setup_fastapi(app)
        self.logger = get_logger('server.access', 'server')
    
    def setup_fastapi(self, app: 'FastAPI') -> None:
        """Setup FastAPI middleware if available."""
        if not FASTAPI_AVAILABLE:
            raise ImportError("FastAPI is not installed. Install it with 'pip install fastapi'")
        
        class FastAPILoggingMiddleware(BaseHTTPMiddleware):
            async def dispatch(self, request: Request, call_next: Callable) -> Any:
                request_id = str(uuid.uuid4())
                start_time = time.time()
                
                # Log request
                self.logger.info(
                    'Incoming request',
                    extra={
                        'request_id': request_id,
                        'method': request.method,
                        'url': str(request.url),
                        'client': request.client.host if request.client else None,
                        'headers': dict(request.headers)
                    }
                )
                
                try:
                    response = await call_next(request)
                    duration = time.time() - start_time
                    
                    # Log response
                    self.logger.info(
                        'Response sent',
                        extra={
                            'request_id': request_id,
                            'status_code': response.status_code,
                            'duration_ms': duration * 1000
                        }
                    )
                    
                    return response
                    
                except Exception as e:
                    duration = time.time() - start_time
                    
                    # Log error
                    self.logger.error(
                        'Request failed',
                        extra={
                            'request_id': request_id,
                            'error': str(e),
                            'duration_ms': duration * 1000
                        },
                        exc_info=True
                    )
                    raise
        
        app.add_middleware(FastAPILoggingMiddleware)