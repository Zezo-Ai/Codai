from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from dotenv import load_dotenv
import os
import time
from pathlib import Path
from typing import List, Dict
from server.routes import router
from server.logging import get_logger

# Initialize logger
logger = get_logger("debug")

# Security configurations
ALLOWED_ORIGINS: List[str] = [
    "http://localhost:8001",  # Frontend development
    "http://127.0.0.1:8001",  # Frontend development (alternate)
    # Add your production domain here
]

ALLOWED_METHODS: List[str] = [
    "GET",
    "POST",
    "OPTIONS",
]

ALLOWED_HEADERS: List[str] = [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Computer-Use-Enabled",
    "Accept",
    "Origin",
]

def create_app() -> FastAPI:
    """Create and configure the FastAPI application with security settings."""
    # Load .env file from project root
    env_path = Path(__file__).parent.parent / '.env'
    load_dotenv(dotenv_path=env_path)
    
    # Verify API key is loaded
    if not os.getenv("ANTHROPIC_API_KEY"):
        logger.warning("ANTHROPIC_API_KEY not found in environment variables")
    
    app = FastAPI(
        title="CODAI API",
        description="Secure API for CODAI application",
        version="1.0.0",
        docs_url="/api/docs",  # Secure Swagger UI path
        redoc_url="/api/redoc",  # Secure Redoc path
    )
    
    # Add CORS middleware with more permissive configuration for development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # More permissive for development
        allow_credentials=True,
        allow_methods=["*"],  # Allow all methods
        allow_headers=["*"],  # Allow all headers
        expose_headers=["*"],
        max_age=3600,  # Cache preflight requests for 1 hour
    )

    # Add OPTIONS handler for all routes
    @app.options("/{full_path:path}")
    async def options_handler():
        return Response(status_code=200)
    
    # Add security headers middleware
    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        
        # Security Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 http://localhost:8001 http://127.0.0.1:8001; "
            "frame-ancestors 'none'; "
            "form-action 'self';"
        )
        
        return response

    # Rate limiting middleware
    request_counts: Dict[str, Dict[str, float]] = {}
    
    @app.middleware("http")
    async def rate_limit(request: Request, call_next):
        try:
            # Skip rate limiting for OPTIONS requests
            if request.method == "OPTIONS":
                return await call_next(request)

            # Get client IP
            client_ip = request.client.host
            current_time = time.time()
            
            # Initialize or update request count
            if client_ip not in request_counts:
                request_counts[client_ip] = {"count": 1, "timestamp": current_time}
            else:
                # Reset count if more than a minute has passed
                if current_time - request_counts[client_ip]["timestamp"] > 60:
                    request_counts[client_ip] = {"count": 1, "timestamp": current_time}
                else:
                    request_counts[client_ip]["count"] += 1

            # Check rate limit (60 requests per minute)
            if request_counts[client_ip]["count"] > 60:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please try again later."}
                )

            response = await call_next(request)
            return response
            
        except Exception as e:
            logger.error(f"Rate limit error: {str(e)}", extra={
                "client_ip": request.client.host,
                "path": request.url.path,
                "method": request.method
            })
            # On error, allow the request through but log it
            return await call_next(request)

    # Error handling middleware - should be first
    @app.middleware("http")
    async def error_handler(request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            error_id = str(id(e))
            logger.error(f"Error handling request: {str(e)}", extra={
                "error_id": error_id,
                "client_ip": request.client.host,
                "path": request.url.path,
                "method": request.method,
                "error_type": type(e).__name__
            })
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error",
                    "error_id": str(id(e))
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                    "Access-Control-Allow-Headers": "*",
                }
            )
    
    # Add routes with specific prefixes
    from server.routes.health import router as health_router
    from server.routes.chat import router as chat_router
    from server.routes.file_edit import router as file_edit_router
    from server.routes.monitoring import router as monitoring_router
    from server.routes.log_management import router as log_management_router
    from server.routes.metrics import router as metrics_router
    from server.routes.api_key import router as api_key_router

    # Mount health endpoint at root
    app.include_router(health_router)
    
    # Mount chat and file edit routes
    app.include_router(chat_router)
    app.include_router(file_edit_router)
    app.include_router(monitoring_router)
    app.include_router(log_management_router)
    app.include_router(metrics_router)
    app.include_router(api_key_router)
    
    return app

app = create_app()